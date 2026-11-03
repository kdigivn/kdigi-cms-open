/**
 * Builds a Schema.org WebPage JSON-LD node.
 *
 * Rank Math cross-references: isPartOf → WebSite, primaryImageOfPage → ImageObject,
 * breadcrumb → BreadcrumbList, all by @id.
 */
export interface WebPageInput {
  pageUrl: string        // canonical URL, e.g. https://example.com/chinh-sach-bao-mat/
  name: string
  description?: string
  publishedTime?: string
  modifiedTime?: string
  websiteId: string      // @id of the WebSite node
  imageId?: string       // @id of the ImageObject node (= image URL)
  breadcrumbId?: string  // @id of the BreadcrumbList node
  lang?: string
  /** Override @type — e.g. 'ItemPage' for products, 'AboutPage' etc. Defaults to 'WebPage'. */
  pageType?: string
}

const PAGE_TYPE_BY_SLUG: Record<string, string> = {
  'lien-he': 'ContactPage',
  contact: 'ContactPage',
  'contact-us': 'ContactPage',
  'gioi-thieu': 'AboutPage',
  about: 'AboutPage',
  'about-us': 'AboutPage',
}

/** schema.org page subtype for the standard contact/about static pages; undefined → plain WebPage. */
export function pageTypeForSlug(slug: string): string | undefined {
  return Object.hasOwn(PAGE_TYPE_BY_SLUG, slug) ? PAGE_TYPE_BY_SLUG[slug] : undefined
}

export function buildWebPage(input: WebPageInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': input.pageType ?? 'WebPage',
    '@id': `${input.pageUrl}#webpage`,
    url: input.pageUrl,
    name: input.name,
    inLanguage: input.lang ?? 'vi',
    isPartOf: { '@id': input.websiteId },
  }

  if (input.description) node.description = input.description
  if (input.publishedTime) node.datePublished = input.publishedTime
  if (input.modifiedTime) node.dateModified = input.modifiedTime
  if (input.imageId) node.primaryImageOfPage = { '@id': input.imageId }
  if (input.breadcrumbId) node.breadcrumb = { '@id': input.breadcrumbId }

  return node
}
