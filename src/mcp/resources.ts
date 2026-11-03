import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/** What a model needs to write a body that renders well (mirrors docs/content-markdown.md). */
export const CONTENT_GUIDE = `# Writing content for KDIGI CMS

Bodies are CommonMark + GFM Markdown (field "markdown"). The server renders it to sanitized HTML.

## Allowed output
- Headings (use one H1 at most; prefer starting at ##), paragraphs, **bold**, *italic*, ~~strike~~, \`code\`, fenced code blocks, blockquotes, lists, task lists, tables, links, images, horizontal rules.
- Raw HTML is limited to: h1–h6, p, br, hr, strong, em, del, s, code, pre, blockquote, ul, ol, li, a, img, table/thead/tbody/tr/th/td, div, span, figure, figcaption. Scripts, iframes, styles and event handlers are stripped.

## Links and images
- Internal links: site-relative paths, e.g. [Title](/some-post-slug). Posts and pages live at /{slug}.
- Images: ![alt text](url). Use URLs from search_media or import_media_from_url so width/height are filled in automatically. Always write meaningful alt text.

## Shortcodes
- Reusable snippets of the same site: [sc name="snippet-name"][/sc] or [sc name="snippet-name" /].
- Get valid names from list_shortcodes. Unknown names render as nothing.

## SEO
- Fill seo.title and seo.description (leaving them empty falls back to the site templates).
- Add 1–3 seo.focusKeywords; use the first one in the title, the first paragraph and a heading.
- Check the result with get_seo_report.

## Locales
- "vi" is the default; "en" is the second locale. Write each locale with its own update call ("locale": "en").
`

export function registerResources(server: McpServer): void {
  server.registerResource(
    'content-guide',
    'kcms://guide/content',
    { title: 'Content writing guide', description: 'Markdown, image, shortcode and SEO rules for KDIGI CMS bodies.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: CONTENT_GUIDE }] }),
  )
}
