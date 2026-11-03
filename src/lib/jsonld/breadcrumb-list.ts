/**
 * Builds a Schema.org BreadcrumbList JSON-LD node.
 *
 * Rank Math style: @id uses page URL + #breadcrumb anchor.
 * Hidden breadcrumbs are filtered by the hook before calling this function.
 */
export function buildBreadcrumbList(
  breadcrumbs: Array<{ url: string; text: string }>,
  baseUrl: string,
  pageUrl?: string,
): Record<string, unknown> | null {
  if (!breadcrumbs?.length) return null

  const resolved = breadcrumbs.map((b) => ({
    id: b.url.startsWith('http') ? b.url : `${baseUrl}${b.url}`,
    name: b.text,
  }))
  // Drop consecutive items that resolve to the same URL — e.g. a homepage
  // breadcrumb that repeats "/" twice, which Google flags as a circular
  // BreadcrumbList. Keeps the first occurrence and re-numbers positions.
  const deduped = resolved.filter(
    (item, i) => i === 0 || item.id !== resolved[i - 1].id,
  )

  const node: Record<string, unknown> = {
    '@type': 'BreadcrumbList',
    itemListElement: deduped.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@id': item.id,
        name: item.name,
      },
    })),
  }

  // Attach @id anchor only when we have the canonical page URL
  if (pageUrl) {
    node['@id'] = `${pageUrl}#breadcrumb`
  }

  return node
}
