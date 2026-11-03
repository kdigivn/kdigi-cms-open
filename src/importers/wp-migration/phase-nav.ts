/**
 * Phase `nav` — menus, WordPress-derived Site configuration, and FAQs.
 *
 * Site merge policy: fill/replace only fields that WordPress actually owns
 * (logo, favicon, language, analytics ids, Organization identity, social
 * profiles). Admin-managed groups that do not exist in WordPress (storage
 * credentials, SEO defaults, theme, footer, contact…) are never touched.
 */
import { randomUUID } from 'crypto'
import type { MenuNode } from '../../lib/menu-tree-types'
import type { Site } from '../../payload-types'
import {
  ensureMediaDoc,
  makeLogger,
  staged,
  type ImportContext,
} from './import-context'
import type { StagedMenuNode } from './staged-doc-types'

function toMenuNodes(nodes: StagedMenuNode[]): MenuNode[] {
  return nodes.map((n) => ({
    id: randomUUID(),
    // vi mirrors to en so neither locale renders blank labels
    label: { vi: n.label, en: n.label },
    url: n.url || '#',
    children: toMenuNodes(n.children ?? []),
  }))
}

async function importMenus(ctx: ImportContext): Promise<void> {
  const log = makeLogger('nav')
  for (const menu of staged.menus(ctx.cfg)) {
    const tree = toMenuNodes(menu.tree)
    if (ctx.dryRun) {
      log(
        `DRY menus/${menu.location} → ${tree.length} roots, ${tree.reduce((s, n) => s + n.children.length, 0)} children`,
      )
      continue
    }
    const existing = await ctx.payload.find({
      collection: 'menus',
      where: {
        and: [{ tenant: { equals: ctx.tenantId } }, { location: { equals: menu.location } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length) {
      await ctx.payload.update({
        collection: 'menus',
        id: existing.docs[0].id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { tree } as any,
        depth: 0,
        overrideAccess: true,
      })
      log(`updated menus/${menu.location} (${tree.length} roots)`)
    } else {
      await ctx.payload.create({
        collection: 'menus',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { location: menu.location, tree, tenant: ctx.tenantId } as any,
        overrideAccess: true,
      })
      log(`created menus/${menu.location} (${tree.length} roots)`)
    }
  }
}

export async function importSiteConfig(ctx: ImportContext): Promise<void> {
  const log = makeLogger('nav')
  const site = staged.site(ctx.cfg)
  if (!site) {
    log('no staged site-config — skipping site fields')
    return
  }
  const siteDoc = (
    await ctx.payload.find({
      collection: 'sites',
      where: { siteKey: { equals: ctx.cfg.site } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  if (!siteDoc) {
    if (ctx.dryRun) {
      log(`DRY: site ${ctx.cfg.site} would be updated with staged site config`)
      return
    }
    throw new Error(`site ${ctx.cfg.site} missing — run seed phase`)
  }

  const existing = siteDoc
  const data: Partial<Site> = {}

  const resolveMedia = async (
    ref: Parameters<typeof ensureMediaDoc>[1] | undefined,
    alt: string,
  ): Promise<number | null> => {
    if (!ref) return null
    const id = await ensureMediaDoc(ctx, ref, alt)
    if (id == null) {
      if (!ctx.dryRun) throw new Error(`site media could not be resolved: ${ref.sourceUrl}`)
      return null
    }
    const numericId = typeof id === 'number' ? id : Number(id)
    if (!Number.isInteger(numericId)) throw new Error(`site media returned non-numeric id: ${id}`)
    return numericId
  }

  if (site.defaultLanguage === 'vi' || site.defaultLanguage === 'en') data.defaultLanguage = site.defaultLanguage

  const [logo, favicon] = await Promise.all([
    resolveMedia(site.branding.logo, 'site logo'),
    resolveMedia(site.branding.favicon, 'site favicon'),
  ])
  if (logo != null || favicon != null) {
    data.branding = {
      ...(existing.branding ?? {}),
      ...(logo != null ? { logo } : {}),
      ...(favicon != null ? { favicon } : {}),
    }
  }

  if (site.integration.ga4Id || site.integration.gtmId) {
    data.integration = { ...(existing.integration ?? {}), ...site.integration }
  }

  if (site.knowledgeGraph) {
    const { logo: knowledgeGraphLogo, ...knowledgeGraph } = site.knowledgeGraph
    const logoId = await resolveMedia(
      knowledgeGraphLogo,
      site.knowledgeGraph.name || 'organization logo',
    )
    data.knowledgeGraph = {
      ...(existing.knowledgeGraph ?? {}),
      ...knowledgeGraph,
      ...(logoId != null ? { logo: logoId } : {}),
    }
  }
  if (site.socialProfiles.length) data.socialProfiles = site.socialProfiles

  if (ctx.dryRun) {
    log(`DRY sites/${ctx.cfg.site} ← ${Object.keys(data).join(', ') || '(nothing)'}`)
    return
  }
  if (!Object.keys(data).length) {
    log(`sites/${ctx.cfg.site}: nothing to update from WordPress`)
    return
  }
  await ctx.payload.update({
    collection: 'sites',
    id: siteDoc.id,
    data,
    depth: 0,
    overrideAccess: true,
  })
  log(`updated sites/${ctx.cfg.site}: ${Object.keys(data).join(', ')}`)
}

async function importFaqs(ctx: ImportContext): Promise<void> {
  const log = makeLogger('nav')
  for (const faq of staged.faqs(ctx.cfg)) {
    if (ctx.dryRun) {
      log(`DRY faqs/${faq.group} → ${faq.items.length} items`)
      continue
    }
    const existing = await ctx.payload.find({
      collection: 'faqs',
      where: { and: [{ tenant: { equals: ctx.tenantId } }, { group: { equals: faq.group } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length) {
      await ctx.payload.update({
        collection: 'faqs',
        id: existing.docs[0].id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { items: faq.items } as any,
        depth: 0,
        overrideAccess: true,
      })
      log(`updated faqs/${faq.group} (${faq.items.length} items)`)
    } else {
      await ctx.payload.create({
        collection: 'faqs',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { group: faq.group, items: faq.items, tenant: ctx.tenantId } as any,
        overrideAccess: true,
      })
      log(`created faqs/${faq.group} (${faq.items.length} items)`)
    }
  }
}

export async function runNavPhase(ctx: ImportContext): Promise<void> {
  await importMenus(ctx)
  await importSiteConfig(ctx)
  await importFaqs(ctx)
}
