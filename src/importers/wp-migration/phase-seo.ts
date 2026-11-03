/**
 * Phase `seo` — re-apply the staged seo group onto imported docs and link
 * twitter/og images to the featuredImage media doc (G6). Runs after media so
 * the image relations resolve. WP is source of truth: staged seo fields
 * overwrite; hook-owned fields (jsonLd.raw, breadcrumbs, siteName/locale) are
 * never written (G7).
 */
import { makeLogger, staged, findBySlugTenant, resolveMediaByUrl, type ImportContext } from './import-context'
import type { StagedPage, StagedPost, StagedProduct } from './staged-doc-types'
import { PRESERVE_SOURCE_PUBLISHED_AT } from '../../fields/sidebar-meta-fields'

export async function runSeoPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('seo')
  const counts = { updated: 0, skipped: 0, errors: 0 }

  for (const collection of ['pages', 'posts', 'products'] as const) {
    const docs: Array<StagedPage | StagedPost | StagedProduct> = staged[collection](ctx.cfg)
    for (const docStaged of docs) {
      try {
        const docId = await findBySlugTenant(ctx, collection, docStaged.slug)
        if (!docId) {
          log(`skip (not imported): ${collection}/${docStaged.slug}`)
          counts.skipped++
          continue
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seo: Record<string, any> = { ...(docStaged.seo ?? {}) }
        if (docStaged.date) {
          seo.articleMeta = {
            publishedTime: docStaged.date,
            ...(docStaged.modified ? { modifiedTime: docStaged.modified } : {}),
          }
        }

        if (ctx.dryRun) {
          log(`DRY seo ${collection}/${docStaged.slug} (${Object.keys(seo).length} field group(s))`)
          counts.updated++
          continue
        }

        // twitter:image / og:image ← featuredImage (media phase set the relation)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = (await ctx.payload.findByID({ collection, id: docId, depth: 0, overrideAccess: true })) as any
        const featuredId = existing.featuredImage?.id ?? existing.featuredImage ?? null
        const linkedSocialImage = existing.seo?.openGraph?.image?.id ?? existing.seo?.openGraph?.image ?? null
        const sourceSocialImage = docStaged.openGraphImage ? linkedSocialImage : featuredId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const og: Record<string, any> = seo.openGraph ?? {}
        // Live-prod og-image drift fallback (drift rule #8) stores the CMS's
        // own hosted URL as a plain string in staged — resolve it to a media
        // id (upload field can't take a raw URL) before falling back to featuredId.
        if (typeof og.image === 'string') {
          og.image = (await resolveMediaByUrl(ctx, og.image)) ?? sourceSocialImage ?? undefined
        } else {
          og.image = og.image ?? sourceSocialImage
        }
        if (og.image) {
          og.twitterMeta = { ...(og.twitterMeta ?? {}), image: og.image }
          seo.openGraph = og
        } else {
          delete og.image
          seo.openGraph = og
        }

        if (!Object.keys(seo).length) {
          counts.skipped++
          continue
        }
        await ctx.payload.update({
          collection,
          id: docId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { seo } as any,
          depth: 0,
          overrideAccess: true,
          context: { [PRESERVE_SOURCE_PUBLISHED_AT]: true },
        })
        counts.updated++
      } catch (err) {
        log(`ERROR ${collection}/${docStaged.slug}: ${err instanceof Error ? err.message : err}`)
        counts.errors++
      }
    }
  }

  log(`done — updated: ${counts.updated}, skipped: ${counts.skipped}, errors: ${counts.errors}`)
  if (counts.errors) throw new Error(`seo phase finished with ${counts.errors} error(s)`)
}
