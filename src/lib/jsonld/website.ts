/**
 * Builds a Schema.org WebSite JSON-LD node.
 *
 * Cross-referenced by WebPage.isPartOf and BlogPosting.publisher → Organization.
 * @id uses site root URL + #website anchor (Rank Math convention).
 */
export interface WebSiteInput {
  name: string
  url: string
  alternateName?: string
  organizationId: string // @id of the Organization node
  lang?: string
  /**
   * URL template for the site search endpoint, e.g. '/search?q={search_term_string}'.
   * When set, emits a potentialAction SearchAction for sitelinks searchbox rich results.
   */
  searchActionUrl?: string
}

export function buildWebSite(input: WebSiteInput): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${input.url}/#website`,
    url: input.url,
    name: input.name,
    ...(input.alternateName ? { alternateName: input.alternateName } : {}),
    publisher: { '@id': input.organizationId },
    inLanguage: input.lang ?? 'vi',
    ...(input.searchActionUrl ? {
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: input.searchActionUrl },
        'query-input': 'required name=search_term_string',
      },
    } : {}),
  }
}
