'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

import { computeWordCount } from '@/hooks/posts-word-count'
import { useEditorCopy } from './milkdown-ui-copy'

import { MilkdownFindReplacePanel } from './milkdown-find-replace-panel'
import {
  dispatchFindReplaceAction,
  focusActiveFindMatch,
  getFindReplaceState,
  milkdownFindReplacePlugin,
  replaceAllFindMatches,
  replaceCurrentFindMatch,
} from './milkdown-find-replace-plugin'
import { MilkdownFocusPanel } from './milkdown-focus-panel'
import { milkdownImagePasteDropPlugin } from './milkdown-image-paste-drop-plugin'
import { createPasteRouterHandler } from './milkdown-paste-router'
import { MilkdownOutlineRail } from './milkdown-outline-rail'
import { useMilkdownOutline } from './use-milkdown-outline'
import { larkTaskTriggerInputRule } from './milkdown-lark-input-rules'
import {
  duplicateBlock,
  insertPlainImage,
  moveBlockDown,
  moveBlockUp,
  openLinkEditor,
  setBulletListBlock,
  setCodeBlock,
  setDividerBlock,
  setHeadingBlock,
  setOrderedListBlock,
  setParagraphBlock,
  setQuoteBlock,
  setTaskListBlock,
} from './milkdown-lark-commands'
import { milkdownLarkActiveCellPlugin } from './milkdown-active-cell-plugin'
import {
  LARK_SELECTION_PHASE_EVENT,
  milkdownLarkSelectionPlugin,
  notifyLarkSelectionMenuClosed,
  notifyLarkSelectionMenuOpened,
} from './milkdown-lark-selection-plugin'
import { wpGalleryRemarkPlugin, wpGallerySchema } from './milkdown-wp-gallery'

import './milkdown-lark-theme.css'
import { MilkdownMediaModal } from './milkdown-media-modal'
import { MilkdownSelectionBlockMenu } from './milkdown-selection-block-menu'
import { MilkdownSelectionToolbar } from './milkdown-selection-toolbar'
import {
  createMilkdownSlashMenuPlugin,
  INACTIVE_SLASH_MENU,
  closeSlashMenu,
  deleteSlashTriggerRange,
  openSlashMenuProgrammatically,
  setSlashMenuIndex,
  type SlashMenuState,
} from './milkdown-slash-menu-plugin'
import { createMilkdownBlockHandlePlugin } from './milkdown-block-handle-plugin'
import { MilkdownBlockHandle } from './milkdown-block-handle'
import { MilkdownSlashMenu, type SlashMenuViewGroup } from './milkdown-slash-menu'
import { filterSlashMenuCommands } from './milkdown-slash-menu-filter'
import {
  buildSnippetMenuGroup,
  getBlockTypeMenuItems,
  requireSlashMenuCommand,
  SLASH_MENU_GROUPS,
} from './milkdown-slash-menu-items'
import { MilkdownMentionLinkMenu } from './milkdown-mention-link-menu'
import {
  createMilkdownMentionLinkPlugin,
  INACTIVE_MENTION_LINK,
  type MentionLinkState,
} from './milkdown-mention-link-plugin'
import { shortcodeTag, useTenantShortcodes } from './use-tenant-shortcodes'
import { MilkdownShortcutHelpPanel } from './milkdown-shortcut-help-panel'
import type { Ctx, EditorView } from './milkdown-vendor'
import { editorViewCtx, paragraphSchema, TextSelection } from './milkdown-vendor'
import './milkdown-layer-tokens.css'
import './milkdown-editor-core.css'

interface MilkdownEditorCoreProps {
  markdown: string
  onChange: (value: string) => void
  /**
   * Tenant of the document being edited (Phase 8's F10 media-modal tenant
   * scoping). Optional + backward compatible — omitted callers behave
   * exactly as before (media modal falls back to cookie-only tenant
   * resolution). Threaded straight through to `MilkdownMediaModal`; this
   * component does not read or interpret it itself.
   */
  documentTenantId?: string | number | null
}

type SelectionBlockMenuState = {
  ctx: Ctx
  left: number
  maxHeight: number
  top: number
}

function normalizeCharacterCount(markdown: string) {
  return markdown.replace(/\s+/g, ' ').trim().length
}

/**
 * ⌘⌥ block-type switches (Lark: heading/body/to-do/code/divider), keyed by `event.code`.
 *
 * They are dispatched from a window-CAPTURE listener rather than from the React
 * `onKeyDown` on the editor: Payload's admin save hotkey matches `mod+S` without
 * constraining the other modifiers, so Lark's divider (⌘⌥S / Ctrl+Alt+S) also saved the
 * document — and the save landed mid-debounce, persisting an EMPTY `contentMd`
 * (measured 26/09/2026: a `PATCH /api/posts/<id>` fired for that keypress alone). A
 * React handler runs after the capture phase, so `stopPropagation` there was too late;
 * a capture listener on `window` runs before every document listener and was measured
 * to stop the save completely.
 */
/**
 * macOS reports `⌘` as `metaKey`, so the platform decides which block-move chord applies
 * (see `onKeyDown`): the matrix's bindings are platform-specific and are NOT one chord
 * plus a modifier swap. Safe at module scope: it is only read from event handlers, never
 * during render (so it cannot cause a hydration mismatch).
 */
const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const ALT_BLOCK_ACTIONS: Record<string, Parameters<Crepe['editor']['action']>[0]> = {
  Digit1: (ctx) => setHeadingBlock(ctx, 1),
  Digit2: (ctx) => setHeadingBlock(ctx, 2),
  Digit3: (ctx) => setHeadingBlock(ctx, 3),
  Digit4: (ctx) => setHeadingBlock(ctx, 4),
  Digit5: (ctx) => setHeadingBlock(ctx, 5),
  Digit6: (ctx) => setHeadingBlock(ctx, 6),
  Digit0: setParagraphBlock,
  KeyT: setTaskListBlock,
  KeyC: setCodeBlock,
  KeyS: setDividerBlock,
}

/**
 * Portal target + container-relative anchor just below doc position `pos`, for the menus that
 * hang off the caret (slash, `@`). The container is resolved per call — Crepe replaces its DOM
 * after mount, so a node captured once is detached (see `slashMenu.container`).
 */
function resolveCaretMenuAnchor(
  view: EditorView,
  pos: number,
): { container: HTMLElement | null; anchor: { left: number; top: number } | null } {
  const container = view.dom.closest<HTMLElement>('.milkdown')
  const coords = view.coordsAtPos(pos)
  const rect = container?.getBoundingClientRect()
  return {
    container,
    anchor: rect ? { left: coords.left - rect.left, top: coords.bottom - rect.top + 6 } : null,
  }
}

export function MilkdownEditorCore({ markdown, onChange, documentTenantId }: MilkdownEditorCoreProps) {
  const copy = useEditorCopy()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const initialMarkdownRef = useRef(markdown)
  const latestMarkdownRef = useRef(markdown)
  const selectionSnapshotRef = useRef<{ from: number; to: number } | null>(null)
  const onChangeRef = useRef(onChange)
  // Mirrors `selectionBlockMenu` state for callbacks that must read the
  // latest value without a side effect living inside a setState updater
  // (which React can invoke more than once per commit in dev/Strict Mode).
  const selectionBlockMenuRef = useRef<SelectionBlockMenuState | null>(null)
  // Captured once after `crepe.create()` resolves and reused forever — `ctx`
  // is a live container (`ctx.get(editorViewCtx)` always reads the CURRENT
  // view), never a point-in-time snapshot, so this is safe to hand to the
  // floating toolbar for the lifetime of the editor instance.
  const editorCtxRef = useRef<Ctx | null>(null)

  // The outline (headings + active id) comes from ONE hook shared by the rail and the Focus
  // panel — see `use-milkdown-outline.ts`. `outlineMarkdown` mirrors the live document: local
  // edits arrive through `markdownUpdated`, not through the `markdown` prop.
  const [outlineMarkdown, setOutlineMarkdown] = useState(markdown)
  const {
    headings,
    activeId: activeHeadingId,
    jumpToHeading,
  } = useMilkdownOutline({ markdown: outlineMarkdown, wrapperRef })
  const [wordCount, setWordCount] = useState(() => computeWordCount(markdown))
  const [characterCount, setCharacterCount] = useState(() => normalizeCharacterCount(markdown))
  const [isFocusOpen, setIsFocusOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false)
  const [isFindPanelOpen, setIsFindPanelOpen] = useState(false)
  const [selectionBlockMenu, setSelectionBlockMenu] = useState<SelectionBlockMenuState | null>(null)
  // Bumped on every `markdownUpdated` firing — lets the floating toolbar
  // re-sample command active/current-block state after a command runs even
  // when the selection range itself did not move (e.g. toggling Bold).
  const [contentVersion, setContentVersion] = useState(0)
  // Mirrors the Lark selection plugin's `is-selection-toolbar-visible`
  // wrapper class (true for BOTH the `visible` and `menu-open` phases — see
  // `milkdown-lark-selection-plugin.ts`'s `applyPhase`) into React state via
  // a MutationObserver, so `MilkdownSelectionToolbar` can read it as a prop
  // without importing plugin internals or duplicating its phase machinery.
  const [isSelectionToolbarVisible, setIsSelectionToolbarVisible] = useState(false)
  // React-state mirror of `editorCtxRef`, for the one consumer
  // (`MilkdownSelectionToolbar`) that needs it as a prop — reading a ref's
  // `.current` directly during render is unsafe (React can't know to
  // re-render when it changes); callbacks elsewhere in this file still read
  // `editorCtxRef.current` directly, which is fine outside render.
  const [editorCtx, setEditorCtx] = useState<Ctx | null>(null)
  const [findQuery, setFindQuery] = useState('')
  const [findReplaceValue, setFindReplaceValue] = useState('')
  const [findCaseSensitive, setFindCaseSensitive] = useState(false)
  const [findUi, setFindUi] = useState({ currentIndex: 0, totalMatches: 0 })

  // Open-ORDER stack across the five closable surfaces, so Escape can close
  // exactly the topmost one (see `closeTopmostSurface` below). The flags are
  // not mutually exclusive (Find can stay open under the Image modal), so a
  // fixed priority list cannot know which surface the user sees on top —
  // only open order can. Maintained by the tracking effects right below;
  // ref (not state) because Escape handling reads it synchronously and it
  // must never trigger re-renders itself.
  const surfaceStackRef = useRef<Array<'block-menu' | 'find' | 'focus' | 'help' | 'media-modal'>>([])
  const trackSurface = useCallback(
    (id: 'block-menu' | 'find' | 'focus' | 'help' | 'media-modal', open: boolean) => {
      const stack = surfaceStackRef.current
      const index = stack.indexOf(id)
      if (open && index === -1) stack.push(id)
      if (!open && index !== -1) stack.splice(index, 1)
    },
    [],
  )
  useEffect(() => trackSurface('block-menu', Boolean(selectionBlockMenu)), [selectionBlockMenu, trackSurface])
  useEffect(() => trackSurface('find', isFindPanelOpen), [isFindPanelOpen, trackSurface])
  useEffect(() => trackSurface('help', isHelpOpen), [isHelpOpen, trackSurface])
  useEffect(() => trackSurface('media-modal', isMediaModalOpen), [isMediaModalOpen, trackSurface])
  useEffect(() => trackSurface('focus', isFocusOpen), [isFocusOpen, trackSurface])

  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })

  useLayoutEffect(() => {
    selectionBlockMenuRef.current = selectionBlockMenu
  })

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    // Consumes the selection plugin's purpose-built phase event instead of
    // observing wrapper class mutations (the plugin dispatches
    // LARK_SELECTION_PHASE_EVENT on every phase change — the class toggle is
    // just its CSS side effect). Initial state `false` matches the plugin's
    // `idle` phase at mount; the plugin is created after this effect runs.
    const onPhaseChange = (event: Event) => {
      const phase = (event as CustomEvent<{ phase: string }>).detail?.phase
      setIsSelectionToolbarVisible(phase === 'visible' || phase === 'menu-open')
    }
    wrapper.addEventListener(LARK_SELECTION_PHASE_EVENT, onPhaseChange)
    return () => wrapper.removeEventListener(LARK_SELECTION_PHASE_EVENT, onPhaseChange)
  }, [])

  // Crepe's editor.action throws if called before create() settles (the ctx
  // container isn't ready). Panels can technically fire in that window, so
  // every imperative editor touch goes through these guarded helpers.
  const getEditorView = useCallback((): EditorView | null => {
    const crepe = crepeRef.current
    if (!crepe) return null
    try {
      return crepe.editor.action((ctx) => ctx.get(editorViewCtx))
    } catch {
      return null
    }
  }, [])

  // E2E test hook (SP2-1 / phase 4). The Lark parity matrix spec asserts on the
  // ProseMirror document JSON and the serialized Markdown instead of pixels, so it
  // needs a stable way to read them. Exposed ONLY when NEXT_PUBLIC_E2E=1 (the
  // dedicated Playwright server sets it), so the production bundle never carries
  // it — `e2e/global-setup.ts` fails fast when the hook is missing, which is what
  // makes a silently reused uninstrumented dev server impossible to miss (RT-15).
  useEffect(() => {
    // TWO gates, deliberately:
    //   - `NODE_ENV` is always inlined by Next at build time, so a production build
    //     compiles this effect away even if NEXT_PUBLIC_E2E happens to be set.
    //   - `NEXT_PUBLIC_E2E` keeps the hook absent in normal local dev too. Next only
    //     inlines `process.env.NEXT_PUBLIC_*` entries that exist at build time, so on
    //     its own it is not a compile-time guarantee.
    if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_E2E !== '1') return
    const api = {
      /** Latest Markdown as serialized by the editor (the `*Md` field value). */
      getMarkdown: () => latestMarkdownRef.current,
      /** Current ProseMirror doc as JSON, or null before `crepe.create()` settles. */
      getDocJSON: () => {
        const view = getEditorView()
        return view ? view.state.doc.toJSON() : null
      },
    }
    const target = window as unknown as { __milkdownE2E?: typeof api }
    target.__milkdownE2E = api
    return () => {
      if (target.__milkdownE2E === api) delete target.__milkdownE2E
    }
  }, [getEditorView])

  const syncFindUi = useCallback(() => {
    const view = getEditorView()
    if (!view) return
    const state = getFindReplaceState(view)
    setFindUi({
      currentIndex: state.activeIndex,
      totalMatches: state.matches.length,
    })
  }, [getEditorView])

  const runEditorAction = useCallback((action: Parameters<Crepe['editor']['action']>[0]) => {
    try {
      crepeRef.current?.editor.action(action)
    } catch {
      // Editor not created yet — drop the action instead of crashing the form.
    }
  }, [])

  /**
   * Claim the ⌘⌥ block combos in the CAPTURE phase, before the admin's own hotkeys.
   *
   * See `ALT_BLOCK_ACTIONS` for the measurement that forced this: the divider combo
   * (⌘⌥S) also triggered Payload's `mod+S` save, which persisted the Markdown field
   * mid-debounce as empty. The React `onKeyDown` below skips these combos now, so this
   * listener is their single owner; it mirrors that handler's own guard (ignore keys
   * typed into inputs/buttons) and only acts while the caret is inside this editor.
   */
  useEffect(() => {
    const onCaptureKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return
      const action = ALT_BLOCK_ACTIONS[event.code]
      if (!action) return
      const root = rootRef.current
      const target = event.target as HTMLElement | null
      if (!root || !target || !root.contains(target)) return
      if (target.closest('input, textarea, button')) return
      event.preventDefault()
      event.stopPropagation()
      runEditorAction(action)
    }
    window.addEventListener('keydown', onCaptureKeyDown, true)
    return () => window.removeEventListener('keydown', onCaptureKeyDown, true)
  }, [runEditorAction])

  const openMediaModal = useCallback(() => {
    runEditorAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      selectionSnapshotRef.current = {
        from: view.state.selection.from,
        to: view.state.selection.to,
      }
    })
    setIsMediaModalOpen(true)
  }, [runEditorAction])

  // Notifies the ProseMirror selection plugin so it holds the toolbar/
  // selection open (`menu-open` phase) while this dropdown is up, then
  // resumes normal behavior and restores editor focus when it closes —
  // regardless of which path closed it (item click, outside pointer,
  // Escape, resize/scroll). Reads the CURRENT menu state from a ref rather
  // than inside the `setSelectionBlockMenu` updater so the ctx/focus side
  // effects run exactly once even under double-invoked updaters.
  const closeSelectionBlockMenu = useCallback(() => {
    const current = selectionBlockMenuRef.current
    if (current) {
      try {
        const view = current.ctx.get(editorViewCtx)
        notifyLarkSelectionMenuClosed(view)
        requestAnimationFrame(() => {
          try {
            view.focus()
          } catch {
            // Editor can be destroyed while the menu is closing.
          }
        })
      } catch {
        // ctx may already be torn down (editor unmounted while menu was open).
      }
    }
    setSelectionBlockMenu(null)
  }, [])

  // Anchors from the CALLER-SUPPLIED rect (the new React toolbar's own
  // block-type trigger button, measured via its own ref in
  // `milkdown-selection-toolbar.tsx`) instead of DOM-querying Crepe's
  // `.milkdown-toolbar` — that element no longer exists now that Crepe's
  // toolbar feature is disabled (see the Phase 4 comment on the `Crepe`
  // constructor below). Reads `ctx` from `editorCtxRef` rather than a
  // parameter since every caller now shares the one stable ctx captured
  // after `crepe.create()` resolves.
  const openSelectionBlockMenu = useCallback((anchorRect: DOMRect) => {
    const ctx = editorCtxRef.current
    if (!ctx) return

    if (selectionBlockMenuRef.current) {
      closeSelectionBlockMenu()
      return
    }

    const menuWidth = 280
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - menuWidth - 8))
    const availableBelow = window.innerHeight - anchorRect.bottom - 16
    const availableAbove = anchorRect.top - 16
    const placeBelow = availableBelow >= 280 || availableBelow >= availableAbove
    const maxHeight = Math.max(240, Math.min(516, placeBelow ? availableBelow : availableAbove))
    const top = placeBelow ? anchorRect.bottom + 8 : Math.max(8, anchorRect.top - maxHeight - 8)

    try {
      notifyLarkSelectionMenuOpened(ctx.get(editorViewCtx))
    } catch {
      // Editor not ready — still open the menu; callers already guard
      // against calling this before the editor mounts.
    }
    setSelectionBlockMenu({ ctx, left, maxHeight, top })
  }, [closeSelectionBlockMenu])

  useEffect(() => {
    if (!selectionBlockMenu) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('.milkdown-selection-block-menu')) return
      // The trigger button owns its own open/close toggle (see
      // `MilkdownSelectionToolbar`'s `handleTriggerClick`) — this listener
      // must not race it with a second, conflicting close.
      if (target?.closest('[data-command-group="block-type"]')) return
      closeSelectionBlockMenu()
    }
    const closeOnViewportChange = (event: Event) => {
      const target = event.target as Element | null
      if (target?.closest?.('.milkdown-selection-block-menu')) return
      closeSelectionBlockMenu()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [closeSelectionBlockMenu, selectionBlockMenu])

  const insertImageAtSelection = useCallback((payload: { alt: string; src: string }) => {
    if (!payload.src.trim()) return
    runEditorAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const snapshot = selectionSnapshotRef.current
      if (snapshot) {
        const maxPos = view.state.doc.content.size
        const from = Math.max(0, Math.min(snapshot.from, maxPos))
        const to = Math.max(from, Math.min(snapshot.to, maxPos))
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      }
      insertPlainImage(ctx, {
        alt: payload.alt.trim(),
        src: payload.src.trim(),
      })
    })
    selectionSnapshotRef.current = null
    setIsMediaModalOpen(false)
  }, [runEditorAction])

  // ─── Owned slash menu + block handle (phase 5, SP2-2) ──────────────────────────
  // Crepe's `BlockEdit` feature is disabled below and replaced by these surfaces. The
  // menu is presentational; the trigger state lives in `milkdown-slash-menu-plugin.ts`
  // and is pushed here through the plugin's view hook.
  const [slashMenu, setSlashMenu] = useState<{
    state: SlashMenuState
    anchor: { left: number; top: number } | null
    /**
     * Live portal target. Resolved from `view.dom.closest('.milkdown')` on every state
     * change — NOT captured once after `create()`: Crepe replaces its editor DOM after
     * mount, and a captured node is detached by then (measured: the portal rendered
     * into an orphan and the menu never appeared).
     */
    container: HTMLElement | null
  }>({ state: INACTIVE_SLASH_MENU, anchor: null, container: null })
  const slashStateRef = useRef<SlashMenuState>(INACTIVE_SLASH_MENU)
  const [handleHost, setHandleHost] = useState<HTMLElement | null>(null)
  const blockHandleApiRef = useRef<{ addBlockBelow: () => void } | null>(null)

  /**
   * Menu contents for the current query, filtered with the SAME tested algorithm the
   * phase-5 reference implementation used (`milkdown-slash-menu-filter.ts`) — that is
   * where diacritic-insensitive matching ("tieu de 2" → "Tiêu đề 2") already lives.
   */
  // Phase 8: the tenant's shortcodes join the static commands as a "Snippets" group.
  const tenantShortcodes = useTenantShortcodes(documentTenantId)
  const slashMenuGroups = useMemo(() => {
    const snippets = buildSnippetMenuGroup(
      tenantShortcodes.map((shortcode) => ({ ...shortcode, tag: shortcodeTag(shortcode.name) })),
    )
    return snippets ? [...SLASH_MENU_GROUPS, snippets] : SLASH_MENU_GROUPS
  }, [tenantShortcodes])

  const slashGroups = useMemo<SlashMenuViewGroup[]>(
    () =>
      slashMenuGroups
        .map((group) => ({
          ...group,
          items: filterSlashMenuCommands(group.items, slashMenu.state.query),
        }))
        .filter((group) => group.items.length > 0),
    [slashMenu.state.query, slashMenuGroups],
  )

  /** Flat item list for the CURRENT query — the index space the menu navigates. */
  const flatSlashItems = useCallback(
    (query: string) => slashMenuGroups.flatMap((group) => filterSlashMenuCommands(group.items, query)),
    [slashMenuGroups],
  )

  /** Commands that replace the CURRENT block type, as opposed to inserting a node. */
  const blockTransformIds = useMemo(
    () => new Set(getBlockTypeMenuItems().map((item) => item.id)),
    [],
  )

  const onSlashStateChange = useCallback((state: SlashMenuState, view: EditorView) => {
    slashStateRef.current = state
    const container = view.dom.closest<HTMLElement>('.milkdown')
    if (!state.visible) {
      // Keep the previous object identity while already hidden: the plugin pushes an
      // update on every transaction, and re-rendering the whole editor on each
      // keystroke of unrelated typing is exactly the cost this guard avoids.
      setSlashMenu((previous) =>
        previous.state.visible ? { state, anchor: null, container } : previous,
      )
      return
    }
    setSlashMenu({ state, ...resolveCaretMenuAnchor(view, state.from) })
  }, [])

  // ─── `@` internal-link picker (phase 8, SP2-5) ────────────────────────────────
  const [mentionMenu, setMentionMenu] = useState<{
    state: MentionLinkState
    anchor: { left: number; top: number } | null
    container: HTMLElement | null
  }>({ state: INACTIVE_MENTION_LINK, anchor: null, container: null })

  const onMentionStateChange = useCallback((state: MentionLinkState, view: EditorView) => {
    if (!state.visible) {
      // Same identity guard as the slash menu: no re-render per keystroke while hidden.
      setMentionMenu((previous) =>
        previous.state.visible ? { state, anchor: null, container: previous.container } : previous,
      )
      return
    }
    setMentionMenu((previous) =>
      previous.state.visible &&
      previous.state.from === state.from &&
      previous.state.query === state.query
        ? previous
        : { state, ...resolveCaretMenuAnchor(view, state.from) },
    )
  }, [])

  /**
   * Execute the highlighted item.
   *
   * [RT-10] The tracked `/query` range is deleted first — never the block — and then:
   *  - a block-type command on a block that still holds authored text
   *    (`Keep this paragraph /ta`) does NOT convert it: an empty block is inserted
   *    below and THAT is converted, so nothing the author typed is rewritten;
   *  - every other command (link, table, image) runs at the resulting caret.
   */
  const runSlashMenuItem = useCallback(
    (index: number) => {
      const state = slashStateRef.current
      const item = flatSlashItems(state.query)[index]
      if (!item) return
      const needsBlockBelow = blockTransformIds.has(item.id) && state.blockHasOtherContent
      runEditorAction((ctx) => {
        const view = ctx.get(editorViewCtx)
        deleteSlashTriggerRange(view)
        if (needsBlockBelow) {
          const $from = view.state.selection.$from
          const insertAt = $from.after($from.depth)
          let tr = view.state.tr.insert(insertAt, paragraphSchema.type(ctx).create())
          tr = tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)))
          view.dispatch(tr.scrollIntoView())
        }
        if (item.insertText !== undefined) {
          // Snippet: the exact shortcode tag `expand-shortcodes.ts` expands on render.
          view.dispatch(view.state.tr.insertText(item.insertText).scrollIntoView())
          return
        }
        if (item.commandId === null) {
          // Interactive item (`image`): the media modal supplies src/alt.
          openMediaModal()
          return
        }
        requireSlashMenuCommand(item.commandId).run?.(ctx)
      })
    },
    [blockTransformIds, flatSlashItems, openMediaModal, runEditorAction],
  )

  const onSlashSelectedIndexChange = useCallback(
    (index: number) => {
      const view = getEditorView()
      if (!view) return
      setSlashMenuIndex(view, index, flatSlashItems(slashStateRef.current.query).length)
    },
    [flatSlashItems, getEditorView],
  )

  const onSlashClose = useCallback(() => {
    const view = getEditorView()
    if (view) closeSlashMenu(view)
  }, [getEditorView])

  const onBlockHandleAdd = useCallback(() => {
    blockHandleApiRef.current?.addBlockBelow()
  }, [])

  const onBlockHandleRunCommand = useCallback(
    (commandId: string) => {
      runEditorAction((ctx) => {
        requireSlashMenuCommand(commandId).run?.(ctx)
      })
      // The command acted on the editor's selection, so hand focus back: the button that
      // opened the menu took it (measured: `document.activeElement` was the handle's
      // `DIV.operation-item`, and typing after closing the menu went nowhere).
      getEditorView()?.focus()
    },
    [getEditorView, runEditorAction],
  )

  /** Closing the `⋮⋮` menu (Escape, or picking an item) must leave the caret usable. */
  const onBlockHandleMenuClose = useCallback(() => {
    getEditorView()?.focus()
  }, [getEditorView])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Phase 4 (Lark editor stabilization plan): Crepe's built-in floating
    // toolbar is disabled entirely, not layered under a React portal.
    // Crepe's `ToolbarFeatureConfig` can only register a flat, fixed row of
    // buttons — it has no real dropdown/combobox primitive, no roving-focus
    // keyboard menu, no hook to hold the ProseMirror selection open across a
    // pointer-down, and no viewport-collision anchoring API. The prior
    // implementation worked around the missing dropdown by rendering all 13
    // block-type buttons and hiding 12 of them with
    // `.toolbar-item:nth-of-type(-n + 13)` CSS (see
    // reports/phase-01-baseline-inventory.md §2-3) — a second, independent
    // "Turn into" menu (`MilkdownSelectionBlockMenu`) already had to exist
    // beside it for real dropdown behavior. Given a real menu was already
    // required, `MilkdownSelectionToolbar` below replaces Crepe's toolbar
    // with one custom surface instead of stacking a portal over hidden Crepe
    // buttons, which the plan explicitly rules out (see phase-04's
    // "Architecture" section and Risks).
    const crepe = new Crepe({
      root,
      defaultValue: initialMarkdownRef.current,
      features: {
        // Phase 5: Crepe's `BlockEdit` provided the slash menu, the block handle AND
        // drag-to-reorder as one feature. Disabling it hands all three to our surfaces
        // (`milkdown-slash-menu.tsx` + `milkdown-block-handle.tsx`); drag/positioning are
        // reused from `@milkdown/kit/plugin/block`, which Crepe only ever configured.
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: 'Paste link…',
        },
        [Crepe.Feature.Placeholder]: {
          mode: 'doc',
          text: 'Type / for commands',
        },
      },
    })
    // WP galleries are block HTML. Keep each original gallery as one atom so
    // unrelated prose edits cannot flatten or reorder its images/captions.
    crepe.editor.use(wpGallerySchema)
    crepe.editor.use(wpGalleryRemarkPlugin)


    crepe.editor.use(milkdownFindReplacePlugin)
    crepe.editor.use(milkdownImagePasteDropPlugin)
    crepe.editor.use(milkdownLarkSelectionPlugin)
    crepe.editor.use(milkdownLarkActiveCellPlugin)
    crepe.editor.use(createMilkdownSlashMenuPlugin(onSlashStateChange))
    crepe.editor.use(createMilkdownMentionLinkPlugin(onMentionStateChange))
    // Lark's brackets-only to-do trigger (`[] `) — see `milkdown-lark-input-rules.ts`.
    crepe.editor.use(larkTaskTriggerInputRule)

    crepe.editor.use(
      createMilkdownBlockHandlePlugin({
        mountHandle: (host) => setHandleHost(host),
        onViewReady: (api) => {
          blockHandleApiRef.current = api
        },
        // `+` inserts the empty paragraph; the menu then opens on it, exactly like
        // Crepe's `menuAPI.show(pos)` after its own `onAdd`.
        onAdd: () => {
          const view = getEditorView()
          if (view) openSlashMenuProgrammatically(view)
        },
      }),
    )
    crepeRef.current = crepe

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md, prevMd) => {
        if (md === prevMd) return
        latestMarkdownRef.current = md
        setOutlineMarkdown(md)
        setWordCount(computeWordCount(md))
        setCharacterCount(normalizeCharacterCount(md))
        setContentVersion((version) => version + 1)
        onChangeRef.current(md)
        syncFindUi()
      })
    })

    const ready = crepe.create().then(() => {
      latestMarkdownRef.current = initialMarkdownRef.current
      // Paste ownership [RT-11] — see `milkdown-paste-router.ts` for why this is a direct
      // view prop (ProseMirror consults it BEFORE plugin props, and Milkdown's own clipboard
      // plugin is registered too early for a plugin router to ever see an HTML paste).
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx))
      view.setProps({
        handlePaste: createPasteRouterHandler(() => editorCtxRef.current),
      })
      syncFindUi()
      // Capture the stable ctx once for the floating toolbar (see the
      // `editorCtxRef` doc comment above) — `runEditorAction` guards against
      // the editor having been destroyed in the meantime.
      runEditorAction((ctx) => {
        editorCtxRef.current = ctx
        setEditorCtx(ctx)
      })
    })

    return () => {
      crepeRef.current = null
      editorCtxRef.current = null
      ready.catch(() => {}).then(() => crepe.destroy())
    }
  }, [getEditorView, onMentionStateChange, onSlashStateChange, openMediaModal, runEditorAction, syncFindUi])

  // Event-driven (not effect-driven): the panel handlers push query changes
  // straight into the ProseMirror plugin, then read the match count back.
  const applyFindQuery = useCallback(
    (query: string, caseSensitive: boolean) => {
      setFindQuery(query)
      setFindCaseSensitive(caseSensitive)
      const view = getEditorView()
      if (!view) return
      dispatchFindReplaceAction(view, { type: 'set-query', caseSensitive, query })
      focusActiveFindMatch(view)
      syncFindUi()
    },
    [getEditorView, syncFindUi],
  )

  /**
   * Focus mode's scroll behaviour: the shell (not the editor) is the scroll container there,
   * so wheel events outside the editor are forwarded into it. Active-heading tracking is NOT
   * here any more — `useMilkdownOutline` owns it for both the rail and the Focus panel.
   */
  useEffect(() => {
    if (!isFocusOpen) return
    const wrapper = wrapperRef.current
    const scroller = wrapper?.querySelector<HTMLElement>('.milkdown') ?? wrapper
    if (!scroller) return

    const forwardShellScroll = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.milkdown, .milkdown-focus-shell__toc')) return
      event.preventDefault()
      scroller.scrollBy({ top: event.deltaY })
    }

    wrapper?.addEventListener('wheel', forwardShellScroll, { passive: false })
    return () => wrapper?.removeEventListener('wheel', forwardShellScroll)
  }, [isFocusOpen])

  // Keyboard chords match on event.code (physical key), NOT event.key: with
  // Shift/Alt held the produced character differs per layout (Shift+8 = '*',
  // macOS Option+1 = '¡', VNI/Telex layouts remap digits), so key-based
  // matching silently breaks — this is exactly how the previous Quote and
  // list chords were dead on arrival.
  // Escape closes ONLY the topmost open surface, decided by actual OPEN
  // ORDER (`surfaceStackRef`, pushed on open / removed on close by the
  // tracking effects above) — NOT a fixed priority list. A fixed list gets
  // the non-mutually-exclusive combinations wrong: with Find open (small
  // floating box) and the Image modal opened on top of it, a fixed
  // menu>find>help>modal>focus chain closes the HIDDEN Find panel first
  // while the visible modal stays up (Review A Important-1). This handler is
  // a safety net for surfaces that don't self-handle Escape via
  // `usePanelFocusTrap`'s `stopPropagation()` (the Turn-Into dropdown,
  // Insert Image modal, focus mode); for the panels that DO stop
  // propagation, their own handler claims the keystroke first and this one
  // never fires. Applied in BOTH branches (editor content and
  // input/textarea/button targets) for the reason 7a's report flagged: an
  // Escape landing on a toolbar control had the identical cascade bug.
  const closeFindPanel = useCallback(() => {
    const view = getEditorView()
    if (view) {
      dispatchFindReplaceAction(view, { type: 'close' })
      syncFindUi()
    }
    setIsFindPanelOpen(false)
    setFindQuery('')
    setFindReplaceValue('')
  }, [getEditorView, syncFindUi])

  const closeTopmostSurface = (): boolean => {
    const top = surfaceStackRef.current[surfaceStackRef.current.length - 1]
    switch (top) {
      case 'block-menu':
        closeSelectionBlockMenu()
        return true
      case 'find':
        closeFindPanel()
        return true
      case 'help':
        setIsHelpOpen(false)
        return true
      case 'media-modal':
        setIsMediaModalOpen(false)
        return true
      case 'focus':
        setIsFocusOpen(false)
        return true
      default:
        return false
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, button')) {
      if (event.key === 'Escape') {
        closeTopmostSurface()
      }
      return
    }

    if (event.key === 'Escape') {
      closeTopmostSurface()
      return
    }

    // Block reordering (phase 6): on Windows these bindings carry NO mod key at all, so
    // they must be matched before the `isMod` guard below. Each platform claims only its
    // own chord — the other one is that platform's native "extend selection by word".
    if (event.shiftKey && !event.metaKey) {
      const isMoveChord = IS_APPLE
        ? event.ctrlKey && !event.altKey
        : event.altKey && !event.ctrlKey
      if (isMoveChord && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        event.stopPropagation()
        runEditorAction(event.key === 'ArrowUp' ? moveBlockUp : moveBlockDown)
        return
      }
    }

    const isMod = event.metaKey || event.ctrlKey
    if (!isMod) return

    const run = (action: Parameters<Crepe['editor']['action']>[0]) => {
      event.preventDefault()
      // Keep the combo away from the admin's own hotkeys (defence in depth — the ⌘⌥
      // combos that collided with Payload's `mod+S` save are claimed in the window
      // capture listener instead, see `ALT_BLOCK_ACTIONS`).
      event.stopPropagation()
      runEditorAction(action)
    }

    // ⌘⌥ combos are handled EARLIER, in the window-capture listener — see
    // `ALT_BLOCK_ACTIONS` and the effect below. They cannot live here: Payload's admin
    // save hotkey matches `mod+S` without constraining the other modifiers and listens
    // below the window, so Lark's divider (⌘⌥S) used to save the document mid-edit.
    // A React-level `stopPropagation` is too late; the capture listener runs first.

    // ⌘⇧ combos — lists, quote, find & replace.
    if (event.shiftKey && !event.altKey) {
      if (event.code === 'Digit8') return run(setBulletListBlock)
      if (event.code === 'Digit7') return run(setOrderedListBlock)
      if (event.code === 'Period') return run(setQuoteBlock)
      if (event.code === 'KeyH') {
        event.preventDefault()
        setIsFindPanelOpen(true)
        return
      }
      return
    }

    // Plain ⌘ combos.
    if (event.altKey) return
    if (event.code === 'Slash') {
      event.preventDefault()
      event.stopPropagation()
      setIsHelpOpen(true)
      return
    }
    if (event.code === 'KeyF') {
      event.preventDefault()
      event.stopPropagation()
      setIsFindPanelOpen(true)
      return
    }
    if (event.code === 'KeyK') {
      run(openLinkEditor)
    }
    if (event.code === 'KeyD') {
      run(duplicateBlock)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`milkdown-editor-wrapper${isFocusOpen ? ' is-focus-mode' : ''}`}
      onKeyDown={onKeyDown}
    >
      <div className="milkdown-editor-toolbar">
        <div className="milkdown-editor-toolbar__group">
          <button type="button" onClick={openMediaModal}>
            {copy('Image')}
          </button>
          <button type="button" onClick={() => setIsFindPanelOpen(true)}>
            {copy('Find')}
          </button>
          <button type="button" onClick={() => setIsHelpOpen(true)}>
            {copy('Shortcuts')}
          </button>
        </div>
        <button
          type="button"
          className="milkdown-focus-exit-button"
          onClick={() => setIsFocusOpen((value) => !value)}
        >
          {copy(isFocusOpen ? 'Exit focus' : 'Focus mode')}
        </button>
      </div>

      <MilkdownFocusPanel
        activeHeadingId={activeHeadingId}
        characterCount={characterCount}
        headings={headings}
        onClose={() => setIsFocusOpen(false)}
        onJumpToHeading={jumpToHeading}
        open={isFocusOpen}
        wordCount={wordCount}
      />

      <MilkdownFindReplacePanel
        caseSensitive={findCaseSensitive}
        currentIndex={findUi.currentIndex}
        open={isFindPanelOpen}
        query={findQuery}
        replaceValue={findReplaceValue}
        totalMatches={findUi.totalMatches}
        onCaseSensitiveChange={(caseSensitive) => applyFindQuery(findQuery, caseSensitive)}
        onClose={closeFindPanel}
        onNext={() => {
          const view = getEditorView()
          if (!view) return
          dispatchFindReplaceAction(view, { type: 'next' })
          focusActiveFindMatch(view)
          syncFindUi()
        }}
        onPrev={() => {
          const view = getEditorView()
          if (!view) return
          dispatchFindReplaceAction(view, { type: 'prev' })
          focusActiveFindMatch(view)
          syncFindUi()
        }}
        onQueryChange={(query) => applyFindQuery(query, findCaseSensitive)}
        onReplaceAll={() => {
          const view = getEditorView()
          if (!view) return
          replaceAllFindMatches(view, findReplaceValue)
          syncFindUi()
        }}
        onReplaceOne={() => {
          const view = getEditorView()
          if (!view) return
          replaceCurrentFindMatch(view, findReplaceValue)
          focusActiveFindMatch(view)
          syncFindUi()
        }}
        onReplaceValueChange={setFindReplaceValue}
      />

      <MilkdownShortcutHelpPanel open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <MilkdownSelectionToolbar
        contentVersion={contentVersion}
        ctx={editorCtx}
        isBlockMenuOpen={selectionBlockMenu != null}
        isVisible={isSelectionToolbarVisible}
        onCloseBlockMenu={closeSelectionBlockMenu}
        onOpenBlockMenu={openSelectionBlockMenu}
      />
      {selectionBlockMenu ? (
        <MilkdownSelectionBlockMenu
          ctx={selectionBlockMenu.ctx}
          left={selectionBlockMenu.left}
          maxHeight={selectionBlockMenu.maxHeight}
          top={selectionBlockMenu.top}
          onClose={closeSelectionBlockMenu}
        />
      ) : null}
      <MilkdownMediaModal
        open={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onSelect={insertImageAtSelection}
        documentTenantId={documentTenantId}
      />

      <div ref={rootRef} className="milkdown-editor-root" />
      {/* Focus mode has its own TOC column; two outlines on one screen would compete. */}
      {!isFocusOpen && (
        <MilkdownOutlineRail
          headings={headings}
          activeId={activeHeadingId}
          onJumpToHeading={jumpToHeading}
          onDismiss={() => getEditorView()?.focus()}
        />
      )}
      <MilkdownMentionLinkMenu
        container={mentionMenu.container}
        anchor={mentionMenu.anchor}
        state={mentionMenu.state}
        tenantId={documentTenantId}
        getEditorView={getEditorView}
      />
      <MilkdownSlashMenu
        container={slashMenu.container}
        visible={slashMenu.state.visible}
        anchor={slashMenu.anchor}
        groups={slashGroups}
        selectedIndex={slashMenu.state.selectedIndex}
        onSelectedIndexChange={onSlashSelectedIndexChange}
        onSelect={runSlashMenuItem}
        onClose={onSlashClose}
      />
      {handleHost &&
        createPortal(
          <MilkdownBlockHandle
            onAdd={onBlockHandleAdd}
            onMenuClose={onBlockHandleMenuClose}
            onRunCommand={onBlockHandleRunCommand}
          />,
          handleHost,
        )}
    </div>
  )
}
