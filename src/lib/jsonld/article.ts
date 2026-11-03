/**
 * Builds a Schema.org BlogPosting JSON-LD node for blog/travel-guide posts.
 *
 * WP Rank Math uses BlogPosting (not Article) for posts — matching that here.
 * Cross-references ImageObject, WebPage, Person, and Organization by @id.
 */
export interface BlogPostingInput {
  pageUrl: string        // canonical URL of the post page
  title: string
  description?: string
  keywords?: string
  publishedTime?: string
  modifiedTime?: string
  imageId?: string       // @id of the ImageObject node (= image URL)
  authorId?: string      // @id of the Person node
  organizationId: string // @id of the Organization node
  lang?: string
  /** If FAQPage should be inlined as subjectOf (WP Rank Math pattern). */
  faqNode?: Record<string, unknown>
}

export function buildBlogPosting(input: BlogPostingInput): Record<string, unknown> {
  // Primary @id: WP uses #schema-NNNNN; we use #blogposting for simplicity
  const id = `${input.pageUrl}#blogposting`
  const webpageId = `${input.pageUrl}#webpage`

  const node: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': id,
    headline: input.title,
    name: input.title,
    inLanguage: input.lang ?? 'vi',
    isPartOf: { '@id': webpageId },
    mainEntityOfPage: { '@id': webpageId },
    publisher: { '@id': input.organizationId },
  }

  if (input.description) node.description = input.description
  if (input.keywords) node.keywords = input.keywords
  if (input.publishedTime) node.datePublished = input.publishedTime
  if (input.modifiedTime) node.dateModified = input.modifiedTime
  if (input.imageId) node.image = { '@id': input.imageId }
  if (input.authorId) node.author = { '@id': input.authorId }

  // FAQ inlined as subjectOf per WP Rank Math convention for posts
  if (input.faqNode) node.subjectOf = [input.faqNode]

  return node
}
