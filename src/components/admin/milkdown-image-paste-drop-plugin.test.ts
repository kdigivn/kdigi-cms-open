import assert from 'node:assert/strict'
import test from 'node:test'

import { Schema } from '@milkdown/kit/prose/model'

import {
  createImagePasteDropPlugin,
  milkdownImagePasteDropPluginKey,
} from './milkdown-image-paste-drop-plugin'
import { createPasteRouterHandler } from './milkdown-paste-router'
import type { Ctx } from './milkdown-vendor'
import { EditorState, TextSelection } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
})

function createDoc() {
  return schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('hello world')),
    schema.node('paragraph', null, schema.text('second paragraph')),
  ])
}

/** A fake `Ctx` whose `commandsCtx` slice records the doc position that was
 * current (i.e. the position `insertPlainImage` just moved the selection to)
 * at the moment the insert command would have run — this is exactly the
 * observable seam of the F7 fix: whether that position was correctly mapped
 * through transactions applied during the async upload, or stale. */
function createFakeCtx(view: EditorView, captured: number[]) {
  return {
    get: () => ({
      call: () => {
        captured.push(view.state.selection.from)
      },
    }),
  } as unknown as Ctx
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function withStubbedFetch<T>(impl: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return run().finally(() => {
    globalThis.fetch = original
  })
}

/**
 * Paste is owned by the router (phase 7, [RT-11]); the position tracker it relies on still
 * lives in the image plugin, so these tests drive the real router against that plugin's state.
 */
function imageOnlyClipboard(files: File[]): DataTransfer {
  return { files, getData: () => '' } as unknown as DataTransfer
}

function fakeUploadResponse(url: string): Response {
  return {
    json: async () => ({ doc: { alt: 'an-image', url } }),
    ok: true,
  } as Response
}

test('image paste maps the insert position through a transaction applied during the upload await', async () => {
  const doc = createDoc()
  const captured: number[] = []
  let state = EditorState.create({
    doc,
    plugins: [],
    selection: TextSelection.create(doc, 6), // inside "hello world", before "world"
  })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
    posAtCoords: () => null,
  } as unknown as EditorView

  const ctx = createFakeCtx(view, captured)
  const plugin = createImagePasteDropPlugin(ctx)
  state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, 6) })

  const deferred = createDeferred<Response>()

  await withStubbedFetch(
    (() => deferred.promise) as typeof fetch,
    async () => {
      const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' })
      const handlePaste = createPasteRouterHandler(() => ctx)

      const pasteEvent = {
        clipboardData: imageOnlyClipboard([file]),
        preventDefault: () => {},
      } as unknown as ClipboardEvent

      const handled = handlePaste(view, pasteEvent)
      assert.equal(handled, true)

      // The tracked position should be registered synchronously, before the
      // upload resolves.
      const trackedAfterPaste = milkdownImagePasteDropPluginKey.getState(view.state)
      assert.equal(trackedAfterPaste?.length, 1)
      assert.equal(trackedAfterPaste?.[0].pos, 6)

      // Simulate the user typing 4 characters at the very start of the doc
      // WHILE the upload is still in flight — this is the exact race F7
      // describes. The tracked position must shift forward by 4, not stay
      // frozen at the stale offset 6.
      view.dispatch(view.state.tr.insertText('quux', 1, 1))
      const trackedAfterTyping = milkdownImagePasteDropPluginKey.getState(view.state)
      assert.equal(trackedAfterTyping?.[0].pos, 10, 'tracked pos remaps through the intervening edit')

      deferred.resolve(fakeUploadResponse('https://cdn.example.com/photo.png'))
      // Let the upload's microtask chain (fetch → json → insert) complete.
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      assert.equal(captured.length, 1)
      assert.equal(
        captured[0],
        10,
        'insert used the mapped position, not the stale pre-typing offset (6) nor an unrelated clamp',
      )

      // Tracker is cleaned up once the upload settles.
      assert.equal(milkdownImagePasteDropPluginKey.getState(view.state)?.length, 0)
    },
  )
})

test('image drop uses posAtCoords and falls back to selection.from when it misses', async () => {
  const doc = createDoc()
  const captured: number[] = []
  let state = EditorState.create({ doc, plugins: [], selection: TextSelection.create(doc, 3) })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
    posAtCoords: () => ({ inside: -1, pos: 15 }),
  } as unknown as EditorView

  const ctx = createFakeCtx(view, captured)
  const plugin = createImagePasteDropPlugin(ctx)
  state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, 3) })

  const deferred = createDeferred<Response>()

  await withStubbedFetch(
    (() => deferred.promise) as typeof fetch,
    async () => {
      const file = new File(['fake-bytes'], 'dropped.png', { type: 'image/png' })
      const handleDrop = plugin.props.handleDrop
      assert.ok(handleDrop)

      const dropEvent = {
        clientX: 10,
        clientY: 10,
        dataTransfer: { files: [file] } as unknown as DataTransfer,
        preventDefault: () => {},
      } as DragEvent

      assert.equal(handleDrop.call(plugin, view, dropEvent, null as never, false), true)
      assert.equal(milkdownImagePasteDropPluginKey.getState(view.state)?.[0]?.pos, 15)

      deferred.resolve(fakeUploadResponse('https://cdn.example.com/dropped.png'))
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      assert.equal(captured[0], 15)
    },
  )
})

test('non-image paste is ignored (returns false, no tracked position)', () => {
  const doc = createDoc()
  let state = EditorState.create({ doc, plugins: [], selection: TextSelection.create(doc, 3) })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
  } as unknown as EditorView

  const ctx = createFakeCtx(view, [])
  const plugin = createImagePasteDropPlugin(ctx)
  state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, 3) })

  const textFile = new File(['plain text'], 'notes.txt', { type: 'text/plain' })
  const handlePaste = createPasteRouterHandler(() => ctx)

  const pasteEvent = {
    clipboardData: imageOnlyClipboard([textFile]),
    preventDefault: () => {
      throw new Error('should not preventDefault for a non-image paste')
    },
  } as unknown as ClipboardEvent

  assert.equal(handlePaste(view, pasteEvent), false)
  assert.equal(milkdownImagePasteDropPluginKey.getState(view.state)?.length, 0)
})

test('a failed upload still untracks its position (no leaked tracker entries)', async () => {
  const doc = createDoc()
  let state = EditorState.create({ doc, plugins: [], selection: TextSelection.create(doc, 3) })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
  } as unknown as EditorView

  const ctx = createFakeCtx(view, [])
  const plugin = createImagePasteDropPlugin(ctx)
  state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, 3) })

  await withStubbedFetch(
    (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch,
    async () => {
      const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' })
      const handlePaste = createPasteRouterHandler(() => ctx)
      handlePaste(view, {
        clipboardData: imageOnlyClipboard([file]),
        preventDefault: () => {},
      } as unknown as ClipboardEvent)

      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      assert.equal(milkdownImagePasteDropPluginKey.getState(view.state)?.length, 0)
    },
  )
})
