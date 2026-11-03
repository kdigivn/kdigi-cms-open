import assert from 'node:assert/strict'
import test from 'node:test'

import { Schema } from '@milkdown/kit/prose/model'

import {
  createLarkSelectionPlugin,
  getLarkSelectionPhase,
  notifyLarkSelectionMenuClosed,
  notifyLarkSelectionMenuOpened,
  transitionSelectionPhase,
} from './milkdown-lark-selection-plugin'
import type { SelectionPhase } from './milkdown-lark-selection-plugin'
import { EditorState, NodeSelection, TextSelection } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
})

function createEditorView() {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('alpha')),
    schema.node('paragraph', null, schema.text('beta')),
  ])
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 9),
  })

  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
  } as EditorView

  return view
}

function installTestWindow() {
  const originalWindow = globalThis.window
  const eventTarget = new EventTarget()
  const testWindow = {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    clearTimeout: globalThis.clearTimeout,
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    setTimeout: globalThis.setTimeout,
  } as unknown as Window & typeof globalThis

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
  })

  return {
    dispatch(event: Event) {
      eventTarget.dispatchEvent(event)
    },
    listenerCount(type: string) {
      // EventTarget doesn't expose listener counts directly; track via a
      // wrapping dispatch-and-count probe instead (see cleanup test below).
      return type
    },
    restore() {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    },
  }
}

function pointerEvent(type: string, point?: { x: number; y: number }): Event {
  if (!point) return new Event(type)
  const event = new Event(type) as Event & { clientX: number; clientY: number }
  event.clientX = point.x
  event.clientY = point.y
  return event
}

function createKeyboardEvent(overrides: Partial<KeyboardEvent> = {}) {
  let defaultPrevented = false
  let propagationStopped = false
  const event = {
    altKey: false,
    code: 'KeyA',
    ctrlKey: false,
    get defaultPrevented() {
      return defaultPrevented
    },
    isComposing: false,
    key: 'a',
    metaKey: true,
    preventDefault() {
      defaultPrevented = true
    },
    shiftKey: false,
    stopPropagation() {
      propagationStopped = true
    },
    get propagationStopped() {
      return propagationStopped
    },
    ...overrides,
  }
  return event as KeyboardEvent & { propagationStopped: boolean }
}

function setupPluginView(delayMs: number) {
  const view = createEditorView()
  const classes = new Set<string>()
  const wrapper = {
    classList: {
      add: (value: string) => classes.add(value),
      contains: (value: string) => classes.has(value),
      remove: (value: string) => classes.delete(value),
      toggle: (value: string, force?: boolean) => {
        const shouldAdd = force ?? !classes.has(value)
        if (shouldAdd) classes.add(value)
        else classes.delete(value)
      },
    },
    dispatchEvent: (_event: Event) => true,
  }

  Object.assign(view, {
    dom: { closest: () => wrapper },
    hasFocus: () => true,
  })

  const plugin = createLarkSelectionPlugin(delayMs)
  const pluginView = plugin.spec.view?.(view)
  const pointerDown = plugin.props.handleDOMEvents?.pointerdown
  const keydown = plugin.props.handleDOMEvents?.keydown
  const blur = plugin.props.handleDOMEvents?.blur

  return { blur, classes, keydown, plugin, pluginView, pointerDown, view }
}

// --- Pure transition-table tests -------------------------------------------------

test('transitionSelectionPhase: pointer lifecycle (drag, release, move, jitter)', () => {
  assert.equal(transitionSelectionPhase('idle', { type: 'pointer-down' }), 'pointer-selecting')
  assert.equal(
    transitionSelectionPhase('visible', { type: 'pointer-down' }),
    'pointer-selecting',
    'a new drag always hides an already-visible toolbar',
  )

  assert.equal(
    transitionSelectionPhase('pointer-selecting', { type: 'pointer-up' }),
    'awaiting-pointer-move',
    'pointer-up always waits for the first move to resample the selection — see the reducer comment for why it cannot decide idle-vs-awaiting synchronously',
  )
  assert.equal(
    transitionSelectionPhase('idle', { type: 'pointer-up' }),
    'idle',
    'pointer-up outside a pointer-selecting sequence is a no-op',
  )

  assert.equal(
    transitionSelectionPhase('awaiting-pointer-move', {
      hasSelection: true,
      pastThreshold: false,
      type: 'pointer-move',
    }),
    'awaiting-pointer-move',
    'below-threshold jitter stays hidden',
  )
  assert.equal(
    transitionSelectionPhase('awaiting-pointer-move', {
      hasSelection: true,
      pastThreshold: true,
      type: 'pointer-move',
    }),
    'visible',
  )
  assert.equal(
    transitionSelectionPhase('awaiting-pointer-move', {
      hasSelection: false,
      pastThreshold: true,
      type: 'pointer-move',
    }),
    'idle',
  )
  assert.equal(
    transitionSelectionPhase('visible', {
      hasSelection: true,
      pastThreshold: true,
      type: 'pointer-move',
    }),
    'visible',
    'pointer-move outside awaiting-pointer-move is a no-op',
  )
})

test('transitionSelectionPhase: keyboard reveal never fires during pointer/menu modality', () => {
  assert.equal(
    transitionSelectionPhase('idle', { hasSelection: true, type: 'keyboard-idle-elapsed' }),
    'visible',
  )
  assert.equal(
    transitionSelectionPhase('idle', { hasSelection: false, type: 'keyboard-idle-elapsed' }),
    'idle',
  )
  const nonIdlePhases: SelectionPhase[] = [
    'pointer-selecting',
    'awaiting-pointer-move',
    'menu-open',
    'visible',
  ]
  for (const phase of nonIdlePhases) {
    assert.equal(
      transitionSelectionPhase(phase, { hasSelection: true, type: 'keyboard-idle-elapsed' }),
      phase,
      `keyboard-idle-elapsed must not alter ${phase}`,
    )
  }
})

test('transitionSelectionPhase: menu-open holds the phase and blur is ignored while open', () => {
  assert.equal(transitionSelectionPhase('visible', { type: 'menu-open' }), 'menu-open')
  assert.equal(transitionSelectionPhase('idle', { type: 'menu-open' }), 'menu-open')

  assert.equal(
    transitionSelectionPhase('menu-open', { type: 'selection-collapsed' }),
    'menu-open',
    'selection-collapsed must not leak through while a menu is open',
  )
  assert.equal(
    transitionSelectionPhase('menu-open', { type: 'blur' }),
    'menu-open',
    'clicking a menu control blurs the editor but must not collapse the held selection',
  )

  assert.equal(
    transitionSelectionPhase('menu-open', { hasSelection: true, type: 'menu-close' }),
    'visible',
  )
  assert.equal(
    transitionSelectionPhase('menu-open', { hasSelection: false, type: 'menu-close' }),
    'idle',
  )
})

test('transitionSelectionPhase: blur/escape/selection-collapsed hide from the applicable phases', () => {
  assert.equal(transitionSelectionPhase('visible', { type: 'blur' }), 'idle')
  assert.equal(transitionSelectionPhase('visible', { type: 'escape' }), 'idle')
  assert.equal(transitionSelectionPhase('awaiting-pointer-move', { type: 'escape' }), 'idle')
  assert.equal(transitionSelectionPhase('visible', { type: 'selection-collapsed' }), 'idle')
  assert.equal(
    transitionSelectionPhase('pointer-selecting', { type: 'selection-collapsed' }),
    'pointer-selecting',
    'a mid-drag collapse (click with no drag) is owned by pointer-up, not this event',
  )
})

// --- ProseMirror integration tests ------------------------------------------------

test('Cmd/Ctrl+A selects only the current text block before the base keymap', () => {
  const view = createEditorView()
  const event = createKeyboardEvent()
  const plugin = createLarkSelectionPlugin()
  const handler = plugin.props.handleDOMEvents?.keydown

  assert.ok(handler)
  assert.equal(handler.call(plugin, view, event), true)
  assert.equal(event.defaultPrevented, true)
  assert.equal(event.propagationStopped, true)
  assert.equal(view.state.selection.from, 8)
  assert.equal(view.state.selection.to, 12)
  assert.equal(view.state.doc.textBetween(8, 12), 'beta')
})

test('repeated Cmd/Ctrl+A on the same block keeps the same range and never escalates to the document', () => {
  const view = createEditorView()
  const plugin = createLarkSelectionPlugin()
  const handler = plugin.props.handleDOMEvents?.keydown

  assert.ok(handler)
  handler.call(plugin, view, createKeyboardEvent())
  const firstFrom = view.state.selection.from
  const firstTo = view.state.selection.to

  handler.call(plugin, view, createKeyboardEvent())
  assert.equal(view.state.selection.from, firstFrom)
  assert.equal(view.state.selection.to, firstTo)
  assert.equal(view.state.selection.from > 0, true)
  assert.equal(view.state.selection.to < view.state.doc.content.size, true)
})

test('plain A is not intercepted by the selection plugin', () => {
  const view = createEditorView()
  const event = createKeyboardEvent({ metaKey: false })
  const plugin = createLarkSelectionPlugin()
  const handler = plugin.props.handleDOMEvents?.keydown

  assert.ok(handler)
  assert.equal(handler.call(plugin, view, event), false)
  assert.equal(event.defaultPrevented, false)
  assert.equal(view.state.selection.empty, true)
})

test('Cmd/Ctrl+A keeps a selected non-text block instead of selecting the document', () => {
  const nodeSchema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      horizontal_rule: { group: 'block' },
      paragraph: { content: 'text*', group: 'block' },
      text: { group: 'inline' },
    },
  })
  const doc = nodeSchema.node('doc', null, [
    nodeSchema.node('paragraph', null, nodeSchema.text('alpha')),
    nodeSchema.node('horizontal_rule'),
  ])
  let state = EditorState.create({
    doc,
    selection: NodeSelection.create(doc, 7),
  })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
  } as EditorView
  const event = createKeyboardEvent()
  const plugin = createLarkSelectionPlugin()
  const handler = plugin.props.handleDOMEvents?.keydown

  assert.ok(handler)
  assert.equal(handler.call(plugin, view, event), true)
  assert.equal(event.defaultPrevented, true)
  assert.ok(view.state.selection instanceof NodeSelection)
  assert.equal(view.state.selection.from, 7)
  assert.equal(view.state.selection.to, 8)
})

test('escape key is observed by the plugin but not swallowed (returns false)', () => {
  const view = createEditorView()
  const event = createKeyboardEvent({ code: 'Escape', key: 'Escape', metaKey: false })
  const plugin = createLarkSelectionPlugin()
  const handler = plugin.props.handleDOMEvents?.keydown

  assert.ok(handler)
  assert.equal(handler.call(plugin, view, event), false)
  assert.equal(event.defaultPrevented, false)
})

// --- Keyboard-only reveal (Shift+Arrow / repeated Cmd/Ctrl+A modality) ------------

test('keyboard-driven selection reveals the toolbar after the keyboard-idle delay, not immediately', async () => {
  const testWindow = installTestWindow()
  const { classes, pluginView, view } = setupPluginView(20)

  try {
    assert.ok(pluginView)
    const cursorState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 12)))
    pluginView.update?.(view, cursorState)
    assert.equal(classes.has('is-selection-toolbar-visible'), false)

    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(classes.has('is-selection-toolbar-visible'), true)

    const previousState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)))
    pluginView.update?.(view, previousState)
    assert.equal(classes.has('is-selection-toolbar-visible'), false)
  } finally {
    pluginView?.destroy?.()
    testWindow.restore()
  }
})

// --- Pointer release + first-move gating, with jitter threshold ------------------

test('pointer selection waits for pointer movement after pointerup (no timer fallback)', async () => {
  const testWindow = installTestWindow()
  const { classes, plugin, pluginView, pointerDown, view } = setupPluginView(20)

  try {
    assert.ok(pluginView)
    assert.ok(pointerDown)
    assert.equal(
      pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent),
      false,
    )

    const cursorState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 12)))
    pluginView.update?.(view, cursorState)
    // Slow drag: even after well past the old 500ms mouse delay, still
    // hidden — there is no timer racing the pointer-move gate anymore.
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(classes.has('is-selection-toolbar-visible'), false)

    testWindow.dispatch(pointerEvent('pointerup', { x: 100, y: 100 }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(classes.has('is-selection-toolbar-visible'), false, 'release and wait stays hidden')

    testWindow.dispatch(pointerEvent('pointermove', { x: 103, y: 100 })) // 3px — at threshold, ignored
    assert.equal(classes.has('is-selection-toolbar-visible'), false)

    testWindow.dispatch(pointerEvent('pointermove', { x: 104, y: 100 })) // 4px from release — opens
    assert.equal(classes.has('is-selection-toolbar-visible'), true)

    pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent)
    testWindow.dispatch(new Event('pointerup'))
    pluginView.destroy?.()
    testWindow.dispatch(new Event('pointermove'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(classes.has('is-selection-toolbar-visible'), false)
  } finally {
    pluginView?.destroy?.()
    testWindow.restore()
  }
})

test('pointer jitter below the threshold never opens the toolbar even after a long wait', async () => {
  const testWindow = installTestWindow()
  const { classes, plugin, pluginView, pointerDown, view } = setupPluginView(20)

  try {
    assert.ok(pluginView)
    assert.ok(pointerDown)
    pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent)

    const cursorState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 12)))
    pluginView.update?.(view, cursorState)

    testWindow.dispatch(pointerEvent('pointerup', { x: 50, y: 50 }))
    testWindow.dispatch(pointerEvent('pointermove', { x: 51, y: 50 })) // 1px jitter
    testWindow.dispatch(pointerEvent('pointermove', { x: 50, y: 52 })) // 2px jitter

    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(classes.has('is-selection-toolbar-visible'), false)
  } finally {
    pluginView?.destroy?.()
    testWindow.restore()
  }
})

// --- menu-open holds the selection/toolbar open for Phase 4's toolbar -------------

test('menu-open holds the toolbar open through selection-changing transactions and blur, then menu-close resumes', async () => {
  const testWindow = installTestWindow()
  const { classes, plugin, pluginView, pointerDown, view } = setupPluginView(20)

  try {
    assert.ok(pluginView)
    assert.ok(pointerDown)

    // Reach `visible` the same way a real drag would.
    pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent)
    const cursorState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 12)))
    pluginView.update?.(view, cursorState)

    notifyLarkSelectionMenuOpened(view)
    assert.equal(getLarkSelectionPhase(view), 'menu-open')
    assert.equal(classes.has('is-selection-toolbar-visible'), true)
    assert.equal(classes.has('is-selection-menu-open'), true)

    // A selection-changing transaction while the menu is open (e.g. running
    // a "Turn into" command that re-anchors the block selection) must not
    // hide the toolbar or drop out of menu-open.
    const beforeMenuInteraction = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)))
    pluginView.update?.(view, beforeMenuInteraction)
    assert.equal(getLarkSelectionPhase(view), 'menu-open')
    assert.equal(classes.has('is-selection-toolbar-visible'), true)

    notifyLarkSelectionMenuClosed(view)
    assert.equal(getLarkSelectionPhase(view), 'visible')
    assert.equal(classes.has('is-selection-menu-open'), false)
    assert.equal(classes.has('is-selection-toolbar-visible'), true)
  } finally {
    pluginView?.destroy?.()
    testWindow.restore()
  }
})

// --- Cleanup: nothing survives blur/destroy ---------------------------------------

test('blur hides the toolbar (outside of menu-open) and destroy tears everything down', async () => {
  const testWindow = installTestWindow()
  const { blur, classes, plugin, pluginView, pointerDown, view } = setupPluginView(20)

  try {
    assert.ok(pluginView)
    assert.ok(pointerDown)
    assert.ok(blur)

    pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent)
    const cursorState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 12)))
    pluginView.update?.(view, cursorState)
    testWindow.dispatch(pointerEvent('pointerup', { x: 0, y: 0 }))
    testWindow.dispatch(pointerEvent('pointermove', { x: 10, y: 10 }))
    assert.equal(classes.has('is-selection-toolbar-visible'), true)

    assert.equal(blur.call(plugin, view, new Event('blur') as unknown as FocusEvent), false)
    assert.equal(classes.has('is-selection-toolbar-visible'), false, 'blur hides the toolbar')

    // Re-open, then prove destroy() clears the class and stops reacting to
    // further window pointer events (no stale listeners survive).
    pointerDown.call(plugin, view, new Event('pointerdown') as PointerEvent)
    const nextState = view.state
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)))
    pluginView.update?.(view, nextState)
    testWindow.dispatch(pointerEvent('pointerup', { x: 0, y: 0 }))
    testWindow.dispatch(pointerEvent('pointermove', { x: 10, y: 10 }))
    assert.equal(classes.has('is-selection-toolbar-visible'), true)

    pluginView.destroy?.()
    assert.equal(classes.has('is-selection-toolbar-visible'), false, 'destroy clears the class')
    assert.equal(classes.has('is-selection-menu-open'), false, 'destroy clears the menu class')

    testWindow.dispatch(pointerEvent('pointerdown'))
    testWindow.dispatch(pointerEvent('pointerup', { x: 0, y: 0 }))
    testWindow.dispatch(pointerEvent('pointermove', { x: 20, y: 20 }))
    assert.equal(
      classes.has('is-selection-toolbar-visible'),
      false,
      'destroyed controller no longer reacts to window pointer events',
    )
  } finally {
    pluginView?.destroy?.()
    testWindow.restore()
  }
})

test('getLarkSelectionPhase returns idle for an unregistered view (no controller leaked across tests)', () => {
  const view = createEditorView()
  assert.equal(getLarkSelectionPhase(view), 'idle')
})
