/** Sent to clients on `initialize`; most put it in the model's system prompt. Keep it short. */
export const MCP_INSTRUCTIONS = `KDIGI CMS — multi-site headless CMS. Tools act as the user who owns the API key.
- Call whoami first. If the key has several sites, pass "site" (a siteKey) on every call.
- search_content before creating, to avoid duplicate slugs. Bodies are Markdown in "markdown"; syntax in resource kcms://guide/content, available shortcodes via list_shortcodes.
- Always get_content before update_*, set_status, trash_content or restore_version and pass its updatedAt as expectedUpdatedAt. On "conflict": re-read, re-apply the change, retry once.
- Create as draft. Drafts have no public URL: share adminUrl from get_content_urls for review. Publish (set_status) only when the user explicitly asks; a future publishedAt schedules.
- Default locale is "vi"; use locale "en" for English. translated:false means that locale has no text yet — do not copy the other language into it unless asked.
- On "locked": tell the user who has the document open; do not retry in a loop.
- Never put secrets or credentials into content.`
