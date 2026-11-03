# Markdown Content Fields

How KDIGI CMS stores rich content as Markdown, edits it in the Milkdown editor, and serves sanitized HTML over REST.

## The `markdownHtmlField()` pattern

`markdownHtmlField(name, options)` (`src/fields/markdown-html-field.ts`) returns an **array of two fields**. Spread it into a collection's `fields`:

```ts
...markdownHtmlField('content', { localized: true })
```

| Field | Type | Admin | Role |
| --- | --- | --- | --- |
| `{name}Md` (e.g. `contentMd`) | `textarea` | Visible, rendered by `MarkdownEditorField` (Milkdown) | **Source of truth.** CommonMark + GFM text that editors write |
| `{name}` (e.g. `content`) | `richText` (Lexical) | `admin.hidden: true` | Legacy storage. Its `afterRead` hook is what turns `{name}Md` into HTML for REST |

Options: `{ localized?: boolean; required?: boolean }`. Both apply to **both** fields. Each field adds its own database column (`content_md` and `content` for `content`), so a migration must create both.

Where it is used today:

| Collection | Field name | Md field |
| --- | --- | --- |
| `posts` | `content` | `contentMd` |
| `pages` | `content` | `contentMd` |
| `products` | `content`, `notice` | `contentMd`, `noticeMd` |
| `taxonomies` | `content` | `contentMd` |
| `shortcodes` | `content` (required) | `contentMd` |
| `landings` (layout block `content`) | `body` | `bodyMd` |

`faqs.answer` is not a pair: it is a single textarea holding Markdown, converted to HTML by its own `afterRead` hook with the same pipeline (shortcodes then `markdownToHtml`).

## What REST returns

The `afterRead` hook on `{name}` reads its sibling `{name}Md` and applies this precedence:

| State of `{name}Md` | Value returned for `{name}` |
| --- | --- |
| Non-empty string | Shortcodes expanded (only if the text contains `[sc`), then `markdownToHtml()`, then image dimensions injected: an **HTML string** |
| `''` (empty string) | `null`. Markdown is authoritative and says "no content"; the stale Lexical value is **not** resurrected |
| `null` / `undefined` | Legacy fallback: the Lexical value is converted with `convertLexicalToHTML` (default converters plus a heading converter) |
| No Lexical `root`, or conversion throws | The raw stored value |

The distinction between `''` and `null`/`undefined` is deliberate: a document that has been saved since moving to Markdown must be able to delete its content.

### REST only

The hook starts with `if (req?.payloadAPI !== 'REST') return value`. Consequences:

| Read channel | `content` returns |
| --- | --- |
| REST (`/api/posts?...`) | Rendered, sanitized HTML string |
| GraphQL | Raw Lexical JSON (no render, no shortcode expansion) |
| Local API (`payload.find`, `payload.findByID`) in hooks, scripts, endpoints | Raw Lexical JSON |
| Admin form | Hidden; editors only see `contentMd` |

A custom endpoint or script that needs HTML must read `{name}Md` and render it itself with `expandShortcodesInMarkdown()` and `markdownToHtml()`. `src/endpoints/get-env-page.ts` does exactly this. See [rest-api.md](rest-api.md) for the public response shapes.

## How HTML is produced

`markdownToHtml()` (`src/lib/markdown-to-html.ts`) is a pure function: Markdown in, sanitized HTML out.

1. `markdown-it` renders with `html: true`, `breaks: false`, `linkify: true`. Raw HTML is parsed on purpose, because the editor's GFM table serializer emits literal `<br />` inside table cells.
2. `sanitize-html` is the security boundary. Anything outside the allow-list is stripped.

| Allowed | Values |
| --- | --- |
| Tags | `h1`-`h6`, `p`, `br`, `hr`, `strong`, `em`, `del`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`, `figure`, `figcaption` |
| Attributes | `a`: `href`, `title`, `target`, `rel`; `img`: `src`, `alt`, `title`, `width`, `height`, `loading`; `th`/`td`: `align`; `code`/`pre`: `class`; every tag: `id`, `class` |

`<script>`, `<style>`, `<iframe>`, inline `style` and event-handler attributes never reach the output. There is no separate sanitize step to call: it is built into `markdownToHtml()`.

### Image dimensions

Markdown images carry no size, which makes lazy-loaded images collapse to 0x0 until they load. After rendering, `injectImageDimensions()` (`src/lib/image-dimensions.ts`) adds `width`/`height` to every `<img>` that has neither, when its `src` matches the `url` or `externalUrl` of a Media document of the same site. The URL-to-size map is loaded per site (one query, cached in memory for 5 minutes). It is applied at read time only; stored Markdown is never modified, and a failed lookup only costs the dimensions.

### Other sanitizer

`sanitizeHtmlContent()` (`src/lib/sanitize-html-content.ts`) is a separate, stricter allow-list (`p`, `br`, `strong`, `em`, lists, `a`, `h2`-`h4`, `span`, `div`, basic table tags, `img`) used for user-supplied HTML such as public comments and a few Site fields. It is not part of the Markdown pipeline.

## Shortcodes

Shortcodes are reusable Markdown snippets (price tables, policies, boilerplate) stored in the `shortcodes` collection and embedded in any Markdown field.

**Syntax** (`src/lib/shortcodes/expand-shortcodes.ts`):

```md
[sc name="pet-policy" /]
[sc name="pet-policy"][/sc]
```

- `name` must match `[a-z0-9-]+`; single or double quotes are accepted.
- A backslash-escaped form (`\[sc name="x"/]`) is also matched and the backslash is consumed. The editor serializes a literal `[` as `\[`, so tags typed in the editor are stored escaped.
- A Shortcode's `name` is normalized on save (lowercase, diacritics removed, non-alphanumerics become `-`) and is unique per site. Its body is its own `contentMd`.

**Expansion rules:**

| Rule | Behavior |
| --- | --- |
| Trigger | Only when the Markdown contains the substring `[sc` |
| Scope | Lookup is limited to Shortcodes of the **same site** as the document being read (`data.tenant`: the Sites collection is the multi-site boundary and the relationship fields are literally named `tenant`). No site in context means the tag is left as literal text |
| Locale | The Shortcode is read in `req.locale` |
| Nesting | A Shortcode may contain other shortcodes, up to a depth cap of **3** (`DEFAULT_MAX_DEPTH`). Deeper tags expand to an empty string |
| Cycles | A name already on the current expansion path expands to an empty string |
| Unknown or empty | Unknown name, or a Shortcode with empty `contentMd`, expands to an empty string |
| Output | The expansion is wrapped in blank lines so block content (tables, lists) parses correctly |
| Access | The lookup runs with `overrideAccess: true` and the caller's `req`, so it joins the caller's transaction |

Expansion happens before `markdownToHtml()`, so the expanded text goes through the same sanitizer.

## The editor

`MarkdownEditorField` (`src/components/admin/markdown-editor-field.tsx`) loads the Milkdown/Crepe core (`milkdown-editor-core.tsx`) with `next/dynamic` and `ssr: false`, because Crepe needs browser APIs. The field stores plain Markdown; the component never produces HTML. On locale switch the editor remounts after a short flush window so trailing keystrokes are saved to the previous locale first.

Crepe's built-in `BlockEdit`, `ImageBlock`, `Latex` and `Toolbar` features are turned off and replaced by KDIGI components (custom slash menu, block handle, floating selection toolbar, media modal). Also in the editor: an outline rail, find and replace (Ctrl/Cmd+F, Ctrl/Cmd+Shift+H), and a shortcut help panel (Ctrl/Cmd+/) that lists every shortcut and Markdown input rule.

### Slash menu

Typing `/` opens the command menu (`milkdown-slash-menu-*.ts`):

| Group | Commands |
| --- | --- |
| Basics | Text, Heading 1-6, bulleted list, numbered list, to-do list, code block, quote, divider |
| Common | Link, table, image (opens the media modal) |
| Snippets | The site's Shortcodes. Shown only when the site has at least one; type `/snippet` or `/shortcode` to list them all, or filter by title or name. Selecting one inserts `[sc name="..."/]` |

The Snippets list is fetched once per editor mount from `/api/shortcodes` (up to 100, sorted by title), narrowed to the edited document's site. Hovering shows a 160-character plain-text excerpt.

### Internal link picker (`@`)

Typing `@` at the start of a word (not inside an email address) searches `posts`, `pages`, `products` and `landings` **of the same site** by title or slug (diacritic-insensitive, 150 ms debounce, 8 results per collection). Enter inserts `[Title](/path)`; Escape closes the picker and keeps the typed `@query` text.

- Paths are site-relative and come from `publicPathFor()` (`src/lib/frontend-public-path.ts`): `products` become `/product/{slug}`, `posts`, `pages` and `landings` become `/{slug}`. If your frontend uses different routes, change that one function.
- By default only **live** documents are listed (`status = published` and `publishedAt` empty or in the past). A "drafts/scheduled" toggle includes the rest, and inserting such a link asks for confirmation because it reveals the title and slug once the edited page goes live.
- The search uses the admin's own session, so collection access rules still apply.

### Images and paste

- Pasted or dropped image files are uploaded to `/api/media` and inserted as `![alt](url)`. The multipart helper (`upload-to-payload-media.ts`) sends `alt` (required by Media), `folder` and optional `tenant` inside a `_payload` JSON part, because Payload 3 ignores loose form fields and rejects the request with 400. Your own upload clients must do the same. See [media-storage.md](media-storage.md).
- Rich paste (Google Docs, Word, web pages): HTML on the clipboard is converted to GFM (`src/lib/html-to-gfm.ts`), embedded `data:` images are uploaded, and the result is inserted as a single undo step. Plain text and Markdown paste natively.
- The `/image` command opens a media modal with Upload, Library and URL tabs, scoped to the document's own site. The URL tab re-hosts the remote image through `POST /api/media/from-url` (SSRF-guarded, see [media-storage.md](media-storage.md#import-from-url)).

### WordPress galleries

Migrated WordPress two-column galleries are preserved. `contentMd` keeps the `div.gallery.gallery-columns-2` HTML block (`figure.gallery-item`, `figcaption.gallery-caption`); `milkdown-wp-gallery.ts` stores it as a read-only atom so editing surrounding paragraphs never rewrites it. The block passes through `markdownToHtml()` like any other HTML. See [wordpress-migration/README.md](wordpress-migration/README.md).

## Localization

`localization` is configured with `vi` (default) and `en` with fallback enabled (`src/payload.config.ts`). With `localized: true`, both `{name}Md` and `{name}` are localized, so the rendered HTML follows the request locale (`?locale=en`). This is content localization, separate from the admin UI language.

## Adding a new content field

1. Use `markdownHtmlField('name', { localized: true })` in the collection instead of declaring a `richText` field.
2. Generate the migration (`pnpm payload migrate:create`): it adds `name_md` and `name`.
3. Consumers read HTML from `name` over REST, and Markdown from `nameMd`.
4. In hooks and scripts, read `nameMd` and render it yourself; do not rely on `name` outside REST.
5. If the field is rendered for shortcodes, make sure the document has a `tenant` (site) value, or tags stay as literal text.

See also: [collections.md](collections.md), [seo.md](seo.md), [admin-theming.md](admin-theming.md).
