/**
 * The MCP tool surface: one tool per agent op. Descriptions say WHEN to use a tool — they are the
 * main signal a model has. Input JSON Schemas are generated from the strict zod schemas.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'

import { type AgentContext, AgentError, content, media, runOp, schemas, seo, shortcodes, sites, taxonomies } from '../agent-api'

interface ToolDef<S extends z.ZodType> {
  name: string
  description: string
  schema: S
  annotations: ToolAnnotations
  run: (ctx: AgentContext, input: z.infer<S>) => Promise<object>
}

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false }
const CREATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
const UPDATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }

const tool = <S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> => def

export const TOOLS = [
  tool({
    name: 'whoami',
    description: 'Who this API key acts as (email, role) and which sites it can use. Call this first.',
    schema: schemas.whoami,
    annotations: READ,
    run: sites.whoami,
  }),
  tool({
    name: 'list_sites',
    description: 'Sites (siteKey, domain, default language) this key can read and write, plus the content locales.',
    schema: schemas.listSites,
    annotations: READ,
    run: sites.listSites,
  }),
  tool({
    name: 'get_site',
    description: 'One site with counts of posts, pages and taxonomies by type.',
    schema: schemas.getSite,
    annotations: READ,
    run: sites.getSite,
  }),
  tool({
    name: 'search_content',
    description:
      'List posts or pages of a site (newest first) with title/slug search and status/type/taxonomy filters. Use before creating to avoid duplicate slugs. Returns summaries without bodies.',
    schema: schemas.searchContent,
    annotations: READ,
    run: content.searchContent,
  }),
  tool({
    name: 'get_content',
    description:
      'Read one post or page by id or slug: Markdown body, SEO, categories, status and `updatedAt`. Always call before update_*, set_status or trash_content and pass its `updatedAt` as `expectedUpdatedAt`.',
    schema: schemas.getContent,
    annotations: READ,
    run: content.getContent,
  }),
  tool({
    name: 'create_post',
    description:
      'Create a blog/news/guide post from Markdown. Created as draft unless status is given; publish only when the user explicitly asks.',
    schema: schemas.createPost,
    annotations: CREATE,
    run: (ctx, input) => content.createContent(ctx, 'posts', input),
  }),
  tool({
    name: 'update_post',
    description:
      'Change fields of a post; omitted fields keep their value. Requires `expectedUpdatedAt` from get_content (on `conflict`, re-read and re-apply).',
    schema: schemas.updatePost,
    annotations: UPDATE,
    run: (ctx, input) => content.updateContent(ctx, 'posts', input),
  }),
  tool({
    name: 'create_page',
    description: 'Create a static page (About, Contact, landing …) from Markdown. Created as draft unless status is given.',
    schema: schemas.createPage,
    annotations: CREATE,
    run: (ctx, input) => content.createContent(ctx, 'pages', input),
  }),
  tool({
    name: 'update_page',
    description: 'Change fields of a page; omitted fields keep their value. Requires `expectedUpdatedAt` from get_content.',
    schema: schemas.updatePage,
    annotations: UPDATE,
    run: (ctx, input) => content.updateContent(ctx, 'pages', input),
  }),
  tool({
    name: 'set_status',
    description:
      'Publish or unpublish a post/page. A future `publishedAt` with status "published" schedules it (live:false until then). Only on explicit user request.',
    schema: schemas.setStatus,
    annotations: UPDATE,
    run: content.setStatus,
  }),
  tool({
    name: 'trash_content',
    description: 'Move a post/page to the trash (takes it offline; reversible with restore_from_trash). Never deletes permanently.',
    schema: schemas.trashContent,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: content.trashContent,
  }),
  tool({
    name: 'restore_from_trash',
    description: 'Bring a trashed post/page back (keeps its previous status).',
    schema: schemas.restoreFromTrash,
    annotations: UPDATE,
    run: content.restoreFromTrash,
  }),
  tool({
    name: 'list_versions',
    description: 'Saved versions of a post/page (newest first, max 30 kept) — to review or undo earlier edits.',
    schema: schemas.listVersions,
    annotations: READ,
    run: content.listVersions,
  }),
  tool({
    name: 'restore_version',
    description: 'Restore a post/page to a saved version from list_versions. Requires `expectedUpdatedAt` of the current document.',
    schema: schemas.restoreVersion,
    annotations: UPDATE,
    run: content.restoreVersion,
  }),
  tool({
    name: 'list_taxonomies',
    description: 'Categories, tags and other taxonomies of a site (id, type, slug, name, parent).',
    schema: schemas.listTaxonomies,
    annotations: READ,
    run: taxonomies.listTaxonomies,
  }),
  tool({
    name: 'create_taxonomy',
    description: 'Create a category or tag (slug unique per site and type).',
    schema: schemas.createTaxonomy,
    annotations: CREATE,
    run: taxonomies.createTaxonomy,
  }),
  tool({
    name: 'search_media',
    description: 'Find images/files of a site by alt text or filename; returns ids usable as featuredImage and URLs for Markdown.',
    schema: schemas.searchMedia,
    annotations: READ,
    run: media.searchMedia,
  }),
  tool({
    name: 'import_media_from_url',
    description: 'Download a public image (JPEG/PNG/WebP/GIF/AVIF) into the site media library; returns its id and URL.',
    schema: schemas.importMediaFromUrl,
    annotations: { ...CREATE, openWorldHint: true },
    run: media.importMediaFromUrl,
  }),
  tool({
    name: 'update_media_alt',
    description: 'Set the alt text of a media item (accessibility + SEO). Requires `expectedUpdatedAt` from search_media.',
    schema: schemas.updateMediaAlt,
    annotations: UPDATE,
    run: media.updateMediaAlt,
  }),
  tool({
    name: 'list_shortcodes',
    description: 'Shortcodes available on a site and how to embed them in Markdown. Unknown shortcode names render as nothing.',
    schema: schemas.listShortcodes,
    annotations: READ,
    run: shortcodes.listShortcodes,
  }),
  tool({
    name: 'seo_audit',
    description: 'Posts and pages of a site with weak SEO metadata (missing title/description, noindex, low score), worst first.',
    schema: schemas.seoAudit,
    annotations: READ,
    run: seo.seoAudit,
  }),
  tool({
    name: 'get_seo_report',
    description: 'SEO score (0–100) and every individual check for one post/page in one locale. Use after writing to verify.',
    schema: schemas.getSeoReport,
    annotations: READ,
    run: seo.getSeoReport,
  }),
  tool({
    name: 'get_content_urls',
    description:
      'Admin edit URL of a post/page (share it for review) and its public URL when live. Drafts and scheduled docs have no public URL.',
    schema: schemas.getContentUrls,
    annotations: READ,
    run: seo.getContentUrls,
  }),
]

function errorResult(err: AgentError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${err.code}: ${err.message}${err.details ? `\n${JSON.stringify(err.details)}` : ''}` }],
  }
}

export function registerTools(server: McpServer, ctx: AgentContext): void {
  for (const def of TOOLS) {
    const { name, description, schema, annotations } = def
    const run = def.run as (ctx: AgentContext, input: unknown) => Promise<object>
    server.registerTool(name, { description, inputSchema: schema, annotations }, async (args: unknown): Promise<CallToolResult> => {
      try {
        const result = await runOp(ctx, name, schema, args, run)
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result as Record<string, unknown> }
      } catch (err) {
        return errorResult(err instanceof AgentError ? err : new AgentError('internal', 'Internal error'))
      }
    })
  }
}
