---
name: kcms
description: Use for creating, editing, scheduling, publishing or auditing posts, pages, media, categories/tags or SEO on a KDIGI CMS site, via the kdigi MCP tools or the kcms CLI.
---

# KDIGI CMS (kcms)

You act on a live CMS as the user who owns the API key, with that user's role (author, editor, admin) and sites. Every change is visible to the site's editors and, once published, to the public.

## Pick the interface

- **MCP tools available** (`whoami`, `search_content`, `create_post`, …, usually from a server named `kdigi`): use them.
- **Otherwise** run the CLI with `--json` and parse stdout: `kcms whoami --json`, `kcms posts get 12 --json`, `kcms tools call <tool> --args '<json>'` (same tools and arguments as MCP). Exit codes: 2 usage, 3 auth, 4 conflict/locked.
- No configuration yet: ask the user for the CMS URL and to export `KCMS_API_KEY`, then `kcms login --url <url> --key-from-env`. Never ask the user to paste the key into the chat.

## Workflow

1. `whoami` → note the role and sites. If the key has several sites, pass `site` (a siteKey) on every call.
2. `search_content` before creating, to avoid duplicates and to find pages to link internally.
3. `list_taxonomies`, `list_shortcodes` and the resource `kcms://guide/content` before writing a body.
4. Write the body in Markdown. `create_post` / `create_page` without `status` → a **draft**.
5. `get_seo_report` and fix what it flags.
6. `get_content_urls` → share `adminUrl` for review. Drafts and scheduled documents have no public URL.
7. Publish (`set_status` with `published`) **only when the user explicitly asks**. A future `publishedAt` schedules it (`live: false` until then).

## Editing existing documents

- Always `get_content` first and keep its `updatedAt`. Pass it as `expectedUpdatedAt` to `update_post`, `update_page`, `set_status`, `trash_content`, `restore_version` (and `update_media_alt`, from `search_media` with `id`).
- Send only the fields you change; omitted fields keep their value. `categories` replaces the whole list.
- `conflict`: someone saved in between. Re-read, re-apply your change to the new version, retry once. Never overwrite blindly.
- `locked`: an editor has the document open in the admin. Tell the user who, and stop.
- `bodySource: "legacy-converted"`: the stored body is old rich text shown as converted Markdown. Show the user what will change and get consent before writing it back with `acknowledgeLegacyConversion: true`.
- Each document keeps about 30 versions; batch several edits into one update instead of many small ones. `list_versions` / `restore_version` undo mistakes.

## Content rules

- Markdown (GFM). One H1 at most; structure with `##`/`###`.
- Internal links are site-relative: `[Title](/slug)`.
- Images: use URLs from `search_media`, `import_media_from_url` (public JPEG/PNG/WebP/GIF/AVIF) or `kcms media upload <file>`. Always write meaningful alt text.
- Shortcodes: `[sc name="<name>"][/sc]` with names from `list_shortcodes` only; unknown names render as nothing.
- Taxonomies: reference as `{ "type": "tag", "slug": "ai" }` or an id; a bare string means a category slug. Create missing ones with `create_taxonomy` only if the user agrees.
- Locales: `vi` is the default. For English pass `locale: "en"`. A read with `translated: false` means that locale has no text yet — do not copy the Vietnamese text into it unless asked.
- SEO targets (from the CMS scorer): `seo.title` 40–60 characters, `seo.description` 100–160 characters, 1–3 `focusKeywords`; the first keyword in the title, description, slug and the opening paragraph; keyword density about 1–1.5 %; at least one internal link and H2/H3 subheadings; Vietnamese bodies of 700+ syllables score best.

## Safety

- Never publish, unpublish, trash or restore without an explicit instruction for that document.
- `trash_content` is reversible (`restore_from_trash`); there is no permanent delete through the API — do not look for one.
- Never put API keys, passwords or other secrets into content, and never print the key.
- Unsure which site or document the user means? Ask before writing.

See [references/frontmatter.md](references/frontmatter.md) for the CLI's Markdown file format.
