/**
 * Shared Lexical richtext field that serializes to HTML for REST responses.
 * Used by every content body field across collections.
 * Frontend renders via dangerouslySetInnerHTML — expects an HTML string.
 *
 * HTMLConverterFeature registers the serializer nodes.
 * The afterRead hook converts Lexical editor state → HTML string only for
 * REST API requests. Admin panel reads (payloadAPI === 'local') receive the
 * raw Lexical JSON so the editor UI continues to work correctly.
 */
import {
  lexicalEditor,
  HTMLConverterFeature,
  convertLexicalToHTML,
  defaultHTMLConverters,
} from '@payloadcms/richtext-lexical'
import type { FieldHook, RichTextField } from 'payload'
import { headingHTMLConverter } from './heading-html-converter'

// defaultHTMLConverters only covers paragraph/text/linebreak/tab.
// headingHTMLConverter is required so heading nodes (h1–h4) render as <h2> etc.
// instead of "unknown node".
const htmlConvertersWithHeadings = [...defaultHTMLConverters, headingHTMLConverter]

// Converts Lexical JSON state to an HTML string, but only for REST reads.
// Local API reads (admin panel) need the raw Lexical state — skip those.
const toHtmlOnRestRead: FieldHook = async ({ value, req }) => {
  if (req?.payloadAPI !== 'REST') return value
  if (!value?.root) return value
  try {
    return await convertLexicalToHTML({ converters: htmlConvertersWithHeadings, data: value, req })
  } catch {
    return value
  }
}

export function lexicalHtmlField(
  name: string,
  options: { localized?: boolean; required?: boolean } = {},
): RichTextField {
  return {
    name,
    type: 'richText',
    localized: options.localized ?? false,
    required: options.required ?? false,
    editor: lexicalEditor({
      features: ({ defaultFeatures }) => [
        ...defaultFeatures,
        HTMLConverterFeature({}),
      ],
    }),
    hooks: {
      afterRead: [toHtmlOnRestRead],
    },
  }
}
