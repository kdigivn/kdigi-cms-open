import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { Command } from 'commander'

import type { Kcms } from '../client.js'
import { usageError } from '../errors.js'
import { type Collection, contentToMarkdownDoc, createArgs, type MarkdownDoc, parseMarkdownDoc, updateArgs, withUpdatedAt } from '../markdown-doc.js'
import { confirm } from '../prompt.js'
import { action, print, table, withKcms } from '../runtime.js'
import { uploadMedia } from '../upload.js'

type Doc = Record<string, unknown>

const summary = (d: Doc) =>
  `${d.collection} #${d.id} "${d.title}" — ${d.status}${d.live ? ' (live)' : ''}${d.scheduledFor ? ` (scheduled ${d.scheduledFor})` : ''}${d.trashed ? ' (in trash)' : ''}, updatedAt ${d.updatedAt}`

function idOrSlug(value: string): { id: number } | { slug: string } {
  return /^\d+$/.test(value) ? { id: Number(value) } : { slug: value }
}

function parseId(value: string): number {
  if (!/^\d+$/.test(value)) throw usageError(`Expected a numeric id, got "${value}".`)
  return Number(value)
}

async function readDoc(file: string, collection: Collection): Promise<{ text: string; doc: MarkdownDoc }> {
  const text = await readFile(file, 'utf8').catch(() => {
    throw usageError(`Cannot read ${file}`)
  })
  return { text, doc: parseMarkdownDoc(text, collection) }
}

/** A local `featuredImage` path is uploaded first and replaced by the new media id. */
async function resolveFeaturedImage(kcms: Kcms, doc: MarkdownDoc, file: string, site?: string): Promise<void> {
  const image = doc.meta.featuredImage
  if (typeof image !== 'string') return
  if (/^\d+$/.test(image)) {
    doc.meta.featuredImage = Number(image)
    return
  }
  const { id: siteId } = await kcms.call<{ id: number }>('get_site', site ? { site } : {})
  const uploaded = await uploadMedia(kcms.conn, resolve(dirname(file), image), { siteId, alt: doc.meta.title })
  process.stderr.write(`uploaded ${image} → media #${uploaded.id}\n`)
  doc.meta.featuredImage = uploaded.id
}

async function currentUpdatedAt(kcms: Kcms, collection: Collection, id: number): Promise<string> {
  const doc = await kcms.call<Doc>('get_content', { collection, id })
  return String(doc.updatedAt)
}

export function registerContentCommands(program: Command, collection: Collection): void {
  const singular = collection === 'posts' ? 'post' : 'page'
  const cmd = program.command(collection).description(`Manage ${collection}`)
  const list = cmd
    .command('list')
    .description(`List ${collection} (newest first)`)
    .option('-q, --query <text>', 'search title/slug')
    .option('--status <status>', 'draft | published')
    .option('--locale <locale>', 'vi | en')
    .option('--limit <n>', 'page size', (v) => Number(v))
    .option('--page <n>', 'page number', (v) => Number(v))
  if (collection === 'posts') list.option('--taxonomy <type:slug>', 'filter by category/tag, e.g. tag:ai (bare slug = category)')
  list.action(
    action(async (o: Record<string, string | number | undefined>, c: Command) =>
      withKcms(c, async (kcms, g) => {
        const taxonomy = typeof o.taxonomy === 'string' ? o.taxonomy : undefined
        const [type, slug] = taxonomy?.includes(':') ? taxonomy.split(':', 2) : ['category', taxonomy]
        const result = await kcms.call<Doc & { docs: Doc[] }>('search_content', {
          collection,
          ...(g.site ? { site: g.site } : {}),
          ...(o.query ? { query: o.query } : {}),
          ...(o.status ? { status: o.status } : {}),
          ...(o.locale ? { locale: o.locale } : {}),
          ...(o.limit ? { limit: o.limit } : {}),
          ...(o.page ? { page: o.page } : {}),
          ...(slug ? { taxonomy: { type, slug } } : {}),
        })
        print(g, result, () => `${table(result.docs, ['id', 'status', 'live', 'slug', 'title', 'updatedAt'])}\n${result.totalDocs} total`)
      }),
    ),
  )

  cmd
    .command('get <idOrSlug>')
    .description(`Fetch a ${singular} as Markdown with frontmatter`)
    .option('-o, --output <file>', 'write to a file instead of stdout')
    .option('--locale <locale>', 'vi | en')
    .action(
      action(async (ref: string, o: { output?: string; locale?: string }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const doc = await kcms.call<Doc>('get_content', { collection, ...idOrSlug(ref), ...(g.site ? { site: g.site } : {}), ...(o.locale ? { locale: o.locale } : {}) })
          if (doc.bodySource === 'legacy-converted') {
            process.stderr.write('note: this body was converted from legacy rich text; review it and pass --ack-legacy to update.\n')
          }
          if (o.output) {
            await writeFile(o.output, contentToMarkdownDoc(doc))
            print(g, doc, () => `wrote ${o.output} — ${summary(doc)}`)
          } else if (g.json) print(g, doc, () => '')
          else process.stdout.write(contentToMarkdownDoc(doc))
        }),
      ),
    )

  cmd
    .command('create <file>')
    .description(`Create a ${singular} from a Markdown file (draft unless status is set)`)
    .action(
      action(async (file: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const { doc } = await readDoc(file, collection)
          if (doc.meta.id !== undefined) throw usageError('This file already has an `id` — use `update`, or remove `id` to create a copy.')
          if (g.site && !doc.meta.site) doc.meta.site = g.site
          await resolveFeaturedImage(kcms, doc, file, doc.meta.site)
          const result = await kcms.call<Doc>(`create_${singular}`, createArgs(doc, collection))
          print(g, result, () => `created ${summary(result)}\nnext: kcms ${collection} get ${result.id} -o ${file}  (to keep editing with id + updatedAt)`)
        }),
      ),
    )

  cmd
    .command('update <file>')
    .description(`Save changes from a file fetched with \`get -o\` (only changed fields are sent)`)
    .option('--ack-legacy', 'allow replacing a legacy rich-text body with the converted Markdown')
    .option('--clear-body', 'allow saving an empty body')
    .action(
      action(async (file: string, o: { ackLegacy?: boolean; clearBody?: boolean }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const { text, doc } = await readDoc(file, collection)
          if (doc.meta.id === undefined) throw usageError('No `id` in the frontmatter — use `create` for a new document.')
          await resolveFeaturedImage(kcms, doc, file, doc.meta.site ?? g.site)
          const current = await kcms.call<Doc>('get_content', { collection, id: doc.meta.id, ...(doc.meta.locale ? { locale: doc.meta.locale } : {}) })
          const args = updateArgs(doc, current, collection)
          if (Object.keys(args).every((k) => ['id', 'expectedUpdatedAt', 'locale'].includes(k))) {
            print(g, { changed: false, ...current }, () => 'nothing changed')
            return
          }
          if (o.ackLegacy) args.acknowledgeLegacyConversion = true
          if (o.clearBody) args.clearBody = true
          const result = await kcms.call<Doc>(`update_${singular}`, args)
          await writeFile(file, withUpdatedAt(text, String(result.updatedAt)))
          const fields = Object.keys(args).filter((k) => !['id', 'expectedUpdatedAt', 'locale', 'acknowledgeLegacyConversion', 'clearBody'].includes(k))
          print(g, result, () => `updated ${fields.join(', ')} — ${summary(result)}`)
        }),
      ),
    )

  const setStatus = (status: 'published' | 'draft') =>
    action(async (idArg: string, o: { at?: string }, c: Command) =>
      withKcms(c, async (kcms, g) => {
        const id = parseId(idArg)
        const result = await kcms.call<Doc>('set_status', {
          collection,
          id,
          status,
          expectedUpdatedAt: await currentUpdatedAt(kcms, collection, id),
          ...(o.at ? { publishedAt: o.at } : {}),
        })
        print(g, result, () => summary(result))
      }),
    )
  cmd
    .command('publish <id>')
    .description(`Publish a ${singular} (--at schedules it)`)
    .option('--at <iso>', 'publish date; a future date schedules')
    .action(setStatus('published'))
  cmd.command('unpublish <id>').description(`Set a ${singular} back to draft`).action(setStatus('draft'))

  cmd
    .command('trash <id>')
    .description(`Move a ${singular} to the trash (reversible with untrash)`)
    .option('-y, --yes', 'skip the confirmation')
    .action(
      action(async (idArg: string, o: { yes?: boolean }, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const id = parseId(idArg)
          const doc = await kcms.call<Doc>('get_content', { collection, id })
          if (!o.yes && !(await confirm(`Move ${singular} #${id} "${doc.title}" to the trash?`))) return
          const result = await kcms.call<Doc>('trash_content', { collection, id, expectedUpdatedAt: doc.updatedAt })
          print(g, result, () => summary(result))
        }),
      ),
    )

  cmd
    .command('untrash <id>')
    .description(`Restore a ${singular} from the trash`)
    .action(
      action(async (idArg: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc>('restore_from_trash', { collection, id: parseId(idArg) })
          print(g, result, () => summary(result))
        }),
      ),
    )

  cmd
    .command('versions <id>')
    .description(`List saved versions of a ${singular}`)
    .action(
      action(async (idArg: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const result = await kcms.call<Doc & { versions: Doc[] }>('list_versions', { collection, id: parseId(idArg) })
          print(g, result, () => table(result.versions, ['versionId', 'updatedAt', 'status', 'slug', 'title']))
        }),
      ),
    )

  cmd
    .command('restore <id> <versionId>')
    .description(`Restore a ${singular} to a saved version`)
    .action(
      action(async (idArg: string, versionId: string, _o: unknown, c: Command) =>
        withKcms(c, async (kcms, g) => {
          const id = parseId(idArg)
          const result = await kcms.call<Doc>('restore_version', {
            collection,
            versionId: /^\d+$/.test(versionId) ? Number(versionId) : versionId,
            expectedUpdatedAt: await currentUpdatedAt(kcms, collection, id),
          })
          print(g, result, () => summary(result))
        }),
      ),
    )
}
