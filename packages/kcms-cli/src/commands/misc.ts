import type { Command } from 'commander'

import { connect } from '../client.js'
import { configPath, normalizeBaseUrl, readConfig, writeConfig } from '../config.js'
import { usageError } from '../errors.js'
import { ask, askHidden } from '../prompt.js'
import { action, globals, print, table, withKcms } from '../runtime.js'
import { uploadMedia } from '../upload.js'

type Doc = Record<string, unknown>

const siteArg = (site?: string) => (site ? { site } : {})

function collectionArg(value: string): 'posts' | 'pages' {
  if (value !== 'posts' && value !== 'pages') throw usageError('collection must be "posts" or "pages"')
  return value
}

export function registerMiscCommands(program: Command): void {
  program
    .command('login')
    .description('Save the CMS URL and an API key to a profile (validated with whoami)')
    .option('--key-from-env', 'take the key from KCMS_API_KEY instead of prompting')
    .action(
      action(async (o: { keyFromEnv?: boolean }, c: Command) => {
        const g = globals(c)
        const profile = g.profile ?? 'default'
        const url = normalizeBaseUrl(g.url ?? (await ask('CMS URL (e.g. https://cms.example.com): ')))
        const apiKey = o.keyFromEnv ? process.env.KCMS_API_KEY : await askHidden('API key (Admin → Users → API key): ')
        if (!apiKey) throw usageError('No API key given.')
        const kcms = await connect({ url, apiKey, profile, site: g.site })
        const me = await kcms.call<Doc & { sites: Array<{ siteKey: string }> }>('whoami').finally(() => kcms.close())
        const config = readConfig()
        config.profiles[profile] = { url, apiKey, ...(g.site ? { site: g.site } : {}) }
        config.default ??= profile
        writeConfig(config)
        print(g, me, () =>
          [
            `logged in as ${me.email} (${me.role}) — sites: ${me.sites.map((s) => s.siteKey).join(', ') || '(none)'}`,
            `profile "${profile}" saved to ${configPath()} (mode 600)`,
            ...(typeof me.warning === 'string' ? [`warning: ${me.warning}`] : []),
          ].join('\n'),
        )
      }),
    )

  program
    .command('whoami')
    .description('Show the user and sites behind the API key')
    .action(
      action(async (_o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const me = await kcms.call<Doc & { sites: Array<{ siteKey: string }> }>('whoami')
          print(g, me, () =>
            [`${me.email} (${me.role}) @ ${kcms.conn.url}`, `sites: ${me.sites.map((s) => s.siteKey).join(', ') || '(none)'}`, ...(typeof me.warning === 'string' ? [`warning: ${me.warning}`] : [])].join('\n'),
          )
        }),
      ),
    )

  const sites = program.command('sites').description('List sites, or show one')
  sites.action(
    action(async (_o: unknown, c: Command) =>
      withKcms(c, async (kcms, g) => {
        const result = await kcms.call<Doc & { sites: Doc[] }>('list_sites')
        print(g, result, () => table(result.sites, ['id', 'siteKey', 'domain', 'defaultLanguage']))
      }),
    ),
  )
  sites
    .command('get [siteKey]')
    .description('Site details with content counts')
    .action(
      action(async (siteKey: string | undefined, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc>('get_site', siteArg(siteKey ?? g.site))
          print(g, result, () => JSON.stringify(result, null, 2))
        }),
      ),
    )

  const media = program.command('media').description('Images of a site')
  media
    .command('list')
    .option('-q, --query <text>', 'match alt text or filename')
    .option('--limit <n>', 'page size', (v) => Number(v))
    .action(
      action(async (o: { query?: string; limit?: number }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { media: Doc[] }>('search_media', { ...siteArg(g.site), ...(o.query ? { query: o.query } : {}), ...(o.limit ? { limit: o.limit } : {}) })
          print(g, result, () => table(result.media, ['id', 'filename', 'alt', 'url', 'updatedAt']))
        }),
      ),
    )
  media
    .command('upload <file>')
    .description('Upload a local image (jpg, png, webp, gif, avif)')
    .option('--alt <text>', 'alt text (defaults to the file name)')
    .action(
      action(async (file: string, o: { alt?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const { id: siteId } = await kcms.call<{ id: number }>('get_site', siteArg(g.site))
          const result = await uploadMedia(kcms.conn, file, { siteId, alt: o.alt })
          print(g, result, () => `media #${result.id} ${result.url ?? ''}\nMarkdown: ![${result.alt ?? ''}](${result.url ?? ''})`)
        }),
      ),
    )
  media
    .command('import <url>')
    .description('Import a public image URL into the media library')
    .option('--alt <text>', 'alt text')
    .action(
      action(async (url: string, o: { alt?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc>('import_media_from_url', { ...siteArg(g.site), url, ...(o.alt ? { alt: o.alt } : {}) })
          print(g, result, () => `media #${result.id} ${result.url ?? ''}`)
        }),
      ),
    )
  media
    .command('alt <id> <text>')
    .description('Set the alt text of an image')
    .action(
      action(async (idArg: string, text: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const id = Number(idArg)
          const found = await kcms.call<{ media: Doc[] }>('search_media', { ...siteArg(g.site), id })
          const item = found.media[0]
          if (!item) throw usageError(`media #${id} not found on this site`)
          const result = await kcms.call<Doc>('update_media_alt', { id, alt: text, expectedUpdatedAt: item.updatedAt })
          print(g, result, () => `media #${id} alt = "${result.alt}"`)
        }),
      ),
    )

  const taxonomies = program.command('taxonomies').description('Categories, tags and other taxonomies')
  taxonomies
    .command('list')
    .option('--type <type>', 'category | tag | product-category | custom')
    .option('--locale <locale>', 'vi | en')
    .action(
      action(async (o: { type?: string; locale?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { taxonomies: Doc[] }>('list_taxonomies', { ...siteArg(g.site), ...(o.type ? { type: o.type } : {}), ...(o.locale ? { locale: o.locale } : {}) })
          print(g, result, () => table(result.taxonomies, ['id', 'type', 'slug', 'name', 'parent']))
        }),
      ),
    )
  taxonomies
    .command('create <type> <name>')
    .option('--slug <slug>', 'defaults to a slug of the name')
    .option('--parent <id>', 'parent taxonomy id', (v) => Number(v))
    .option('--description <text>')
    .option('--locale <locale>', 'vi | en')
    .action(
      action(async (type: string, name: string, o: { slug?: string; parent?: number; description?: string; locale?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc>('create_taxonomy', { ...siteArg(g.site), type, name, ...o })
          print(g, result, () => `${result.type} #${result.id} ${result.slug}`)
        }),
      ),
    )

  program
    .command('shortcodes')
    .description('Shortcodes usable in Markdown bodies')
    .action(
      action(async (_o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { shortcodes: Doc[] }>('list_shortcodes', siteArg(g.site))
          print(g, result, () => table(result.shortcodes, ['name', 'title', 'usage']))
        }),
      ),
    )

  const seo = program.command('seo').description('SEO checks')
  seo
    .command('audit')
    .description('Posts/pages with weak SEO metadata, worst first')
    .option('--locale <locale>', 'vi | en')
    .option('--limit <n>', 'documents scanned per collection', (v) => Number(v))
    .action(
      action(async (o: { locale?: string; limit?: number }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { deficient: Doc[] }>('seo_audit', { ...siteArg(g.site), ...o })
          print(g, result, () => table(result.deficient, ['collection', 'id', 'score', 'status', 'title', 'reasons']))
        }),
      ),
    )
  seo
    .command('report <collection> <id>')
    .description('Score and every check for one document')
    .option('--locale <locale>', 'vi | en')
    .action(
      action(async (collection: string, id: string, o: { locale?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { score: number; checks: Doc[] }>('get_seo_report', { collection: collectionArg(collection), id: Number(id), ...o })
          print(g, result, () => `score ${result.score}/100\n${table(result.checks, ['id', 'status', 'label'])}`)
        }),
      ),
    )

  program
    .command('urls <collection> <id>')
    .description('Admin URL, and the public URL when live')
    .action(
      action(async (collection: string, id: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc>('get_content_urls', { collection: collectionArg(collection), id: Number(id) })
          print(g, result, () => [`admin:  ${result.adminUrl}`, `public: ${result.publicUrl ?? '(not live)'}`].join('\n'))
        }),
      ),
    )

  const tools = program.command('tools').description('Raw MCP tools (escape hatch)')
  tools.command('list').action(
    action(async (_o: unknown, c: Command) =>
      withKcms(c, async (kcms, g) => {
        const { tools: list } = await kcms.client.listTools()
        print(g, list, () => list.map((t) => `${t.name.padEnd(24)} ${t.description ?? ''}`).join('\n'))
      }),
    ),
  )
  tools
    .command('call <name>')
    .option('--args <json>', 'tool arguments as JSON', '{}')
    .action(
      action(async (name: string, o: { args: string }, c: Command) =>
        withKcms(c, async (kcms) => {
          let args: Record<string, unknown>
          try {
            args = JSON.parse(o.args) as Record<string, unknown>
          } catch {
            throw usageError('--args must be valid JSON')
          }
          process.stdout.write(`${JSON.stringify(await kcms.call(name, args), null, 2)}\n`)
        }),
      ),
    )
}
