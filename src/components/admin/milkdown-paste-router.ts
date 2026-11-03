'use client'

/**
 * Single paste owner (phase 7, SP2-4) — [RT-11].
 *
 * It is installed as a DIRECT `EditorView` prop (`view.setProps({ handlePaste })`) rather than
 * as a plugin: Milkdown's clipboard plugin is registered inside Crepe's constructor — i.e.
 * before any `.use()` a caller can make — and it claims every `text/html` paste, so a
 * plugin-based router never ran (measured: 0 router invocations, native conversion output).
 * ProseMirror consults direct props BEFORE plugin props, and falls through to them when the
 * direct handler returns false, which is exactly the delegation this needs.
 *
 * Before this router, `milkdown-image-paste-drop-plugin.ts` claimed EVERY paste that carried
 * image files (`preventDefault()` + `return true`). Clipboards from Google Docs / Word / Lark
 * routinely carry BOTH `text/html` and image files, so all of that text was silently dropped.
 * One router now decides, in this order:
 *
 *   1. a ProseMirror slice from our own editor (`data-pm-slice`) → native paste, structure
 *      already correct;
 *   2. `text/html` → rich paste: convert to GFM (`htmlToGfm`), upload any `data:` images the
 *      converter kept, parse the Markdown with Milkdown's own parser, insert as ONE
 *      transaction (so undo is a single step);
 *   3. image files with no HTML → the existing upload engine;
 *   4. anything else → native paste (plain text, Markdown text, …).
 *
 * The image engine's `handleDrop` is untouched: dropping files is not ambiguous.
 */

import { htmlToGfm, type PastedImage } from '@/lib/html-to-gfm'
import { insertPastedImageFiles } from './milkdown-image-paste-drop-plugin'
import type { Ctx } from './milkdown-vendor'
import { parserCtx, Slice } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'
import { uploadFileToPayloadMedia } from './upload-to-payload-media'

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}

/** `data:` URI → `File`, so pasted screenshots go through the same upload path as files. */
function dataUrlToFile(image: PastedImage): File | null {
  const comma = image.src.indexOf(',')
  if (comma < 0) return null
  const header = image.src.slice(5, comma)
  const type = header.split(';')[0]
  const isBase64 = header.includes('base64')
  try {
    const payload = image.src.slice(comma + 1)
    const binary = isBase64 ? atob(payload) : decodeURIComponent(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new File([bytes], image.alt.trim() || 'pasted-image', { type })
  } catch {
    return null
  }
}

/**
 * Uploads the converter's kept `data:` images and swaps their tokens for real URLs.
 * A failed upload removes that image's Markdown rather than leaving a token in the document.
 */
async function resolveImages(markdown: string, images: PastedImage[]): Promise<string> {
  let resolved = markdown
  for (const image of images) {
    const file = dataUrlToFile(image)
    let url = ''
    if (file) {
      try {
        const doc = await uploadFileToPayloadMedia(file)
        url = String(doc.url ?? '').trim()
      } catch (error) {
        console.error('[milkdown] pasted image upload failed:', error)
      }
    }
    if (url) {
      resolved = resolved.split(image.token).join(url)
    } else {
      // Drop the whole image syntax for this token (alt text may contain no brackets).
      const escapedToken = image.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      resolved = resolved.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedToken}\\)`, 'g'), '')
    }
  }
  return resolved
}

/** Converts the clipboard's HTML and inserts it as one transaction. */
async function insertRichHtml(ctx: Ctx, view: EditorView, html: string, files: File[]): Promise<void> {
  const { markdown, images } = htmlToGfm(html)
  const withImages = await resolveImages(markdown, images)
  const trimmed = withImages.trim()
  if (trimmed.length === 0) {
    // Nothing convertible: hand the paste back to the browser's plain-text path.
    if (files.length > 0) insertPastedImageFiles(ctx, view, files, view.state.selection.from)
    return
  }

  const parsed = ctx.get(parserCtx)(trimmed)
  view.dispatch(
    view.state.tr.replaceSelection(new Slice(parsed.content, 0, 0)).scrollIntoView(),
  )

  // Mixed clipboard where the HTML referenced no image at all (some apps copy the text and
  // the bitmap separately): append the files after the text instead of losing them [RT-11].
  if (files.length > 0 && images.length === 0) {
    insertPastedImageFiles(ctx, view, files, view.state.selection.from)
  }
}

/**
 * Builds the `handlePaste` prop. The context is read lazily per paste: the view/ctx do not
 * exist yet when the prop is installed, and reading them late keeps up with editor restarts.
 */
export function createPasteRouterHandler(
  getCtx: () => Ctx | null,
): (view: EditorView, event: ClipboardEvent) => boolean {
  return (view, event) => {
    const data = event.clipboardData
    if (!data) return false

    const html = data.getData('text/html') ?? ''
    const files = imageFiles(data)

    // Our own editor's clipboard: ProseMirror preserves the structure better than any HTML
    // round-trip, and `htmlToGfm` would flatten marks it cannot express.
    if (html.includes('data-pm-slice')) return false

    if (html.trim().length > 0) {
      event.preventDefault()
      const ctx = getCtx()
      if (!ctx) return false
      void insertRichHtml(ctx, view, html, files).catch((error) =>
        console.error('[milkdown] rich paste failed:', error),
      )
      return true
    }

    if (files.length > 0) {
      event.preventDefault()
      const ctx = getCtx()
      if (!ctx) return false
      insertPastedImageFiles(ctx, view, files, view.state.selection.from)
      return true
    }

    return false
  }
}
