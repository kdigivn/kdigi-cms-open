/**
 * Sitemap priority field — numeric 0.0–1.0, shown in sitemap.xml generation.
 */
import type { Field } from 'payload'

export const sitemapPriorityField = (defaultValue = 0.5): Field => ({
  name: 'sitemapPriority',
  type: 'number',
  defaultValue,
  admin: {
    description: 'Sitemap priority 0.0–1.0 (higher = crawled more frequently)',
    step: 0.1,
  },
  min: 0,
  max: 1,
})
