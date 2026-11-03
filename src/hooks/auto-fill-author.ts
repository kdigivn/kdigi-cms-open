/**
 * beforeChange hook — auto-fills `author` on post create from the logged-in user.
 *
 * Matches by req.user.email AND tenant so a shared email across tenants never
 * assigns the wrong author record (cross-tenant contamination fix).
 *
 * Fails silently (leaves author empty) when:
 *  - not a create operation
 *  - author already set
 *  - no matching author record found for this email + tenant
 */
import type { CollectionBeforeChangeHook } from 'payload'

export const autoFillAuthor: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (operation !== 'create') return data
  if (data.author) return data
  if (!req.user?.email || !data.tenant) return data

  const result = await req.payload.find({
    collection: 'authors',
    where: {
      and: [
        { email: { equals: req.user.email } },
        { tenant: { equals: data.tenant } },
      ],
    },
    limit: 1,
    overrideAccess: true,
    req, // join caller's transaction — avoid a second pool connection
  })

  if (result.docs.length > 0) {
    return { ...data, author: result.docs[0].id }
  }
  return data
}
