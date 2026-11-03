/**
 * Field factory that pairs a Markdown editor field with the legacy Lexical richtext field.
 *
 * Returns an array of two fields:
 *   1. `{name}Md` — text field rendered via MarkdownEditorField (WYSIWYG, what staff edits).
 *   2. `{name}` — richtext Lexical field hidden from the form; afterRead converts to HTML for REST.
 *
 * afterRead priority: if `{name}Md` has content → md→html; else → lexical→html (legacy fallback).
 * This ensures zero data loss for documents that were created before this change.
 *
 * `{name}Md === ''` (explicitly empty, not null/undefined) means the doc has been
 * touched since the Markdown migration and Md is now the authoritative source —
 * an empty Md means "no content", so the stale legacy Lexical value is NOT used as
 * a fallback in that case. Only `{name}Md` being null/undefined (never touched
 * since the migration) triggers the legacy Lexical fallback.
 */
import {
  lexicalEditor,
  HTMLConverterFeature,
  convertLexicalToHTML,
  defaultHTMLConverters,
} from '@payloadcms/richtext-lexical'
import type { Field, FieldHook, PayloadRequest } from 'payload'
import { markdownToHtml } from '../lib/markdown-to-html'
import { injectImageDimensions, loadTenantImageSizes, type ImageSize } from '../lib/image-dimensions'
import { expandShortcodesInMarkdown } from '../lib/shortcodes/expand-shortcodes'
import { headingHTMLConverter } from './heading-html-converter'

// Converters for the Lexical-to-HTML fallback path.
// headingHTMLConverter must be added explicitly because defaultHTMLConverters
// only covers paragraph/text/linebreak/tab — heading nodes produce "unknown node"
// without it.
const htmlConvertersWithHeadings = [...defaultHTMLConverters, headingHTMLConverter]

/** Render a legacy Lexical body to HTML with the same converters the REST fallback uses. */
export function legacyLexicalToHtml(value: Parameters<typeof convertLexicalToHTML>[0]['data'], req: PayloadRequest): Promise<string> {
  return convertLexicalToHTML({ converters: htmlConvertersWithHeadings, data: value, req })
}

function makeAfterRead(mdFieldName: string): FieldHook {
  return async ({ value, siblingData, req, data }) => {
    if (req?.payloadAPI !== 'REST') return value
    const md = siblingData?.[mdFieldName]
    if (typeof md === 'string' && md) {
      const tenantRef = (data as { tenant?: number | string | { id: number | string } } | undefined)?.tenant
      const tenantId = typeof tenantRef === 'object' && tenantRef !== null ? tenantRef.id : tenantRef
      const expandedMd = md.includes('[sc')
        ? await expandShortcodesInMarkdown(md, {
            payload: req.payload,
            req,
            tenantId,
            locale: req.locale,
          })
        : md
      const html = markdownToHtml(expandedMd)
      if (tenantId === undefined || tenantId === null || !html.includes('<img')) return html
      // A failed media lookup only costs the dimensions, never the content.
      const sizes = await loadTenantImageSizes(req.payload, tenantId).catch(() => new Map<string, ImageSize>())
      return injectImageDimensions(html, sizes)
    }
    // Explicitly empty (not null/undefined) — Md is authoritative and says
    // "no content"; don't resurrect a stale legacy Lexical value underneath.
    if (md === '') return null
    if (!value?.root) return value
    try {
      return await legacyLexicalToHtml(value, req)
    } catch {
      return value
    }
  }
}

export function markdownHtmlField(
  name: string,
  options: { localized?: boolean; required?: boolean } = {},
): Field[] {
  const mdFieldName = `${name}Md`
  return [
    {
      name: mdFieldName,
      type: 'textarea',
      localized: options.localized ?? false,
      required: options.required ?? false,
      admin: {
        components: {
          Field: '@/components/admin/markdown-editor-field#MarkdownEditorField',
        },
        description: 'Dán Markdown (heading, list, link, ảnh, bảng GFM, code) → tự render trực tiếp, không escape.',
      },
    } as Field,
    {
      name,
      type: 'richText',
      localized: options.localized ?? false,
      required: false,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [...defaultFeatures, HTMLConverterFeature({})],
      }),
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [makeAfterRead(mdFieldName)],
      },
    } as Field,
  ]
}
