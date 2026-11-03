'use client'

/**
 * Tenant shortcodes for the slash menu's Snippets group (phase 8, SP2-5).
 *
 * Fetched once per editor mount and tenant through the admin's own REST session (the
 * collection's `tenantScopedRead` is the boundary; the `tenant` condition narrows to the edited
 * document's site). Inserting writes the exact tag `expand-shortcodes.ts` expands.
 */

import { useEffect, useState } from 'react'

import { markdownToPlainText } from '@/lib/vietnamese-text'

export const SNIPPET_EXCERPT_LENGTH = 160
/** Shortcodes are a curated list per site; more than this is not a menu any more. */
export const SNIPPET_FETCH_LIMIT = 100

export interface TenantShortcode {
  name: string
  title: string
  /** Plain-text preview of the body, ≤160 chars. */
  excerpt: string
}

export function shortcodeTag(name: string): string {
  return `[sc name="${name}"/]`
}

export function snippetExcerpt(markdown: string): string {
  const plain = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim()
  return plain.length > SNIPPET_EXCERPT_LENGTH ? `${plain.slice(0, SNIPPET_EXCERPT_LENGTH - 1)}…` : plain
}

export function useTenantShortcodes(tenantId: string | number | null | undefined): TenantShortcode[] {
  const [loaded, setLoaded] = useState<{ tenantId: string | number; list: TenantShortcode[] } | null>(null)

  useEffect(() => {
    if (tenantId === null || tenantId === undefined) return
    const controller = new AbortController()
    const search = new URLSearchParams({
      'where[tenant][equals]': String(tenantId),
      limit: String(SNIPPET_FETCH_LIMIT),
      depth: '0',
      sort: 'title',
      'select[title]': 'true',
      'select[name]': 'true',
      'select[contentMd]': 'true',
    })
    fetch(`/api/shortcodes?${search.toString()}`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return []
        const body = (await response.json()) as {
          docs?: Array<{ name?: unknown; title?: unknown; contentMd?: unknown }>
        }
        return (body.docs ?? []).flatMap((doc) => {
          if (typeof doc.name !== 'string' || !doc.name) return []
          const title = typeof doc.title === 'string' && doc.title ? doc.title : doc.name
          const excerpt = typeof doc.contentMd === 'string' ? snippetExcerpt(doc.contentMd) : ''
          return [{ name: doc.name, title, excerpt }]
        })
      })
      .then((list) => {
        if (!controller.signal.aborted) setLoaded({ tenantId, list })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error('[milkdown] shortcode list failed:', error)
      })
    return () => controller.abort()
  }, [tenantId])

  // A list only ever belongs to the tenant it was fetched for.
  return loaded && loaded.tenantId === tenantId ? loaded.list : NO_SHORTCODES
}

const NO_SHORTCODES: TenantShortcode[] = []
