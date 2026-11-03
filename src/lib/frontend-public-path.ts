/**
 * Public (frontend) path of a CMS document — the ONE place in this repo that knows the
 * frontend's routes. Used by the "View on site" endpoint, the SEO internal-link
 * suggester and the editor's `@` link picker, so a frontend route change is a one-line fix here.
 *
 * Convention: a catch-all resolves a single segment `/{slug}` as landing → page → post, and
 * `/product/{slug}` as a product. Adjust the switch below if your frontend routes differently.
 *
 * Paths are RELATIVE on purpose: an inserted link must stay correct on every site domain.
 */

export const PUBLIC_PATH_COLLECTIONS = ['posts', 'pages', 'products', 'landings'] as const

export type PublicPathCollection = (typeof PUBLIC_PATH_COLLECTIONS)[number]

export function isPublicPathCollection(value: string): value is PublicPathCollection {
  return (PUBLIC_PATH_COLLECTIONS as readonly string[]).includes(value)
}

/**
 * @returns the root-relative public path, or `null` for an unknown collection or an empty slug
 *   (a document without a slug has no public URL — callers decide their own fallback).
 */
export function publicPathFor(collection: string, slug: string | null | undefined): string | null {
  if (!slug) return null
  switch (collection) {
    case 'products':
      return `/product/${slug}`
    case 'posts':
    case 'pages':
    case 'landings':
      return `/${slug}`
    default:
      return null
  }
}
