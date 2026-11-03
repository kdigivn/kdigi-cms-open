/**
 * Builds a Schema.org ImageObject JSON-LD node.
 *
 * Used as a standalone graph node (not inline) so WebPage.primaryImageOfPage
 * and BlogPosting.image can cross-reference it by @id.
 */
export interface ImageObjectInput {
  url: string
  width?: number
  height?: number
  caption?: string
}

export function buildImageObject(
  input: ImageObjectInput,
  lang = 'vi',
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'ImageObject',
    '@id': input.url,
    url: input.url,
    inLanguage: lang,
  }
  if (input.width) node.width = input.width
  if (input.height) node.height = input.height
  if (input.caption) node.caption = input.caption
  return node
}
