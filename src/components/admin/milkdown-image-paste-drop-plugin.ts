'use client'
/**
 * Restores the image DROP upload path that Crepe's ImageBlock used to provide, and exposes
 * `insertPastedImageFiles` for the paste router (phase 7, SP2-4): paste is no longer handled
 * here at all — a clipboard carrying BOTH `text/html` and image files used to lose its text
 * because this plugin claimed every image-bearing paste [RT-11]. (the feature is disabled so the Lark-style media modal owns the
 * insert UX). Pasting or dropping image files uploads them through the shared
 * `/api/media` contract, then inserts a plain markdown image (`![alt](url)`)
 * at the paste selection / drop coordinates via Milkdown's insertImageCommand
 * so schema placement rules are respected.
 *
 * The insert position is captured synchronously at paste/drop time but the
 * upload is async, so the document can change (typing, other edits) while we
 * wait. Plugin state tracks each pending upload's position and remaps it
 * through every transaction applied during the await (`apply` below), so the
 * image lands where the user actually dropped/pasted it — a `content.size`
 * clamp alone prevents a crash but does not correct a stale offset.
 */
import { deriveAltFromFilename } from './media-p3-helpers'
import { insertPlainImage } from './milkdown-lark-commands'
import type { Ctx } from './milkdown-vendor'
import { $prose, Plugin, PluginKey, TextSelection } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'
import { uploadFileToPayloadMedia } from './upload-to-payload-media'

type PendingInsert = { id: number; pos: number }

type PendingInsertMeta =
  | { action: 'track'; id: number; pos: number }
  | { action: 'untrack'; id: number }

export const milkdownImagePasteDropPluginKey = new PluginKey<PendingInsert[]>(
  'MILKDOWN_IMAGE_PASTE_DROP',
)
const pluginKey = milkdownImagePasteDropPluginKey

let nextTrackerId = 0

function collectImageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}

function trackInsertPosition(view: EditorView, id: number, pos: number) {
  view.dispatch(view.state.tr.setMeta(pluginKey, { action: 'track', id, pos } satisfies PendingInsertMeta))
}

function untrackInsertPosition(view: EditorView, id: number) {
  view.dispatch(view.state.tr.setMeta(pluginKey, { action: 'untrack', id } satisfies PendingInsertMeta))
}

function readTrackedPosition(view: EditorView, id: number): number | undefined {
  return pluginKey.getState(view.state)?.find((entry) => entry.id === id)?.pos
}

async function uploadAndInsert(ctx: Ctx, view: EditorView, files: File[], initialPos: number) {
  const trackerId = nextTrackerId++
  trackInsertPosition(view, trackerId, initialPos)

  try {
    for (const file of files) {
      try {
        const doc = await uploadFileToPayloadMedia(file)
        const src = String(doc.url ?? '').trim()
        if (!src) continue

        const alt =
          typeof doc.alt === 'string' && doc.alt.trim()
            ? doc.alt.trim()
            : deriveAltFromFilename(file.name)

        // Read the position AFTER the await: `apply()` remapped it through
        // every transaction that landed while this upload was in flight, so
        // it still points at the original drop/paste location even if the
        // user kept typing. Clamping only guards the (rare) case where the
        // tracker itself somehow went missing (e.g. a full doc replace).
        const trackedPos = readTrackedPosition(view, trackerId) ?? view.state.doc.content.size
        const clamped = Math.max(0, Math.min(trackedPos, view.state.doc.content.size))
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(clamped))),
        )
        insertPlainImage(ctx, { alt, src })

        // Advance the tracker past the image we just inserted so a second
        // file in the same paste/drop lands after it, not on top of it.
        trackInsertPosition(view, trackerId, view.state.selection.to)
      } catch (error) {
        // Surface upload failures in the console; the editor content is untouched.
        console.error('[milkdown] image upload failed:', error)
      }
    }
  } finally {
    untrackInsertPosition(view, trackerId)
  }
}

/**
 * Uploads image files and inserts them at `initialPos`, remapping the position through any
 * edit that lands while the upload is in flight. Called by the paste router (paste) and by
 * this plugin's own drop handler.
 */
export function insertPastedImageFiles(
  ctx: Ctx,
  view: EditorView,
  files: File[],
  initialPos: number,
): void {
  void uploadAndInsert(ctx, view, files, initialPos)
}

/** Extracted so unit tests can construct the raw ProseMirror `Plugin` with a
 * lightweight fake `Ctx` — bypassing Milkdown's full ctx/slice bootstrap —
 * while still exercising the real handleDrop/apply logic. */
export function createImagePasteDropPlugin(ctx: Ctx) {
  return new Plugin<PendingInsert[]>({
    key: pluginKey,
    props: {
      handleDrop(view, event) {
        const files = collectImageFiles(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        const dropPos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          ?? view.state.selection.from
        void uploadAndInsert(ctx, view, files, dropPos)
        return true
      },
    },
    state: {
      apply(tr, pending) {
        let next = pending
        if (next.length > 0) {
          next = next
            .map((entry) => ({ ...entry, pos: tr.mapping.map(entry.pos) }))
            .filter((entry) => entry.pos >= 0 && entry.pos <= tr.doc.content.size)
        }

        const meta = tr.getMeta(pluginKey) as PendingInsertMeta | undefined
        if (meta?.action === 'track') {
          next = [...next.filter((entry) => entry.id !== meta.id), { id: meta.id, pos: meta.pos }]
        } else if (meta?.action === 'untrack') {
          next = next.filter((entry) => entry.id !== meta.id)
        }

        return next
      },
      init: () => [],
    },
  })
}

export const milkdownImagePasteDropPlugin = $prose((ctx) => createImagePasteDropPlugin(ctx))
