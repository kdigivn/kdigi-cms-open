/**
 * Admin document-lock check with a useful message.
 *
 * Payload's Local API defaults to `overrideLock: true` — it skips the lock check AND deletes the
 * editor's lock row. Agent writes pass `overrideLock: false` as a backstop, and call this first so
 * the model can tell the user WHO is editing (Payload's `Locked` error carries no holder).
 * `restoreVersion` has no lock check at all in Payload, so this is its only guard.
 */
import type { PayloadRequest } from 'payload'

import type { AgentContext } from './context'
import { AgentError } from './errors'

/** Payload's default lock duration (seconds) when a collection sets no `lockDocuments.duration`. */
const DEFAULT_LOCK_SECONDS = 300

export async function assertNotLocked(
  ctx: AgentContext,
  req: PayloadRequest,
  collection: 'posts' | 'pages' | 'media' | 'taxonomies',
  id: number,
): Promise<void> {
  const lockConfig = ctx.payload.collections[collection]?.config.lockDocuments
  if (lockConfig === false) return
  const seconds = typeof lockConfig === 'object' && lockConfig.duration ? lockConfig.duration : DEFAULT_LOCK_SECONDS

  const { docs } = await ctx.payload.find({
    collection: 'payload-locked-documents',
    req,
    overrideAccess: true,
    depth: 1,
    limit: 1,
    sort: '-updatedAt',
    where: {
      and: [{ 'document.relationTo': { equals: collection } }, { 'document.value': { equals: id } }],
    },
  })
  const lock = docs[0]
  if (!lock) return
  const holder = lock.user.value
  const holderId = typeof holder === 'object' ? holder.id : holder
  if (String(holderId) === String(ctx.user.id)) return
  if (Date.now() - new Date(lock.updatedAt).getTime() > seconds * 1000) return

  const email = typeof holder === 'object' ? holder.email : `user #${holderId}`
  throw new AgentError('locked', `This document is open in the admin by ${email}. Ask them to close it, then retry.`, {
    lockedBy: email,
  })
}
