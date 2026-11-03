/**
 * RatingEvents collection — one record per (collection, contentId, ipHash) tuple.
 *
 * Purpose: IP-based dedup for anonymous ratings so each IP can only count once
 * per content item. The raw IP is never stored — only a SHA-256 hash.
 *
 * This collection is internal (no public REST reads). The submit-rating endpoint
 * writes directly via overrideAccess:true and queries it before incrementing counts.
 *
 * Fields:
 *   collection — slug of the rated collection ('posts' | 'products')
 *   contentId  — string ID of the rated document
 *   ipHash     — SHA-256(clientIP) — privacy-preserving fingerprint
 *
 * A composite index on (collection, contentId, ipHash) is created by migration
 * 20260623_rating_events_table for fast existence checks.
 */
import type { CollectionConfig } from 'payload'

export const RatingEvents: CollectionConfig = {
  slug: 'rating-events',
  labels: {
    singular: { vi: 'Sự kiện đánh giá', en: 'Rating Event' },
    plural: { vi: 'Sự kiện đánh giá', en: 'Rating Events' },
  },
  admin: {
    useAsTitle: 'contentId',
    description: 'Internal dedup log for IP-based rating spam prevention. One record per (collection, contentId, ipHash).',
    defaultColumns: ['collection', 'contentId', 'createdAt'],
    group: { vi: 'Tương tác', en: 'Engagement' },
    hidden: true,
  },
  access: {
    // No public access — all writes go through overrideAccess in the endpoint.
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'collection',
      type: 'text',
      required: true,
      admin: {
        description: "Slug of the rated collection — 'posts' or 'products'.",
      },
    },
    {
      name: 'contentId',
      type: 'text',
      required: true,
      admin: {
        description: 'String ID of the rated document.',
      },
    },
    {
      name: 'ipHash',
      type: 'text',
      required: true,
      admin: {
        description: 'SHA-256 hash of the client IP address — never the raw IP.',
      },
    },
  ],
}
