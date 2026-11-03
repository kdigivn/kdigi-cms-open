/**
 * Builds a Schema.org Person JSON-LD node for post authors.
 *
 * @id uses page URL + #author anchor (Rank Math convention).
 * worksFor cross-references Organization by @id.
 */
export interface PersonInput {
  name: string
  pageUrl: string      // canonical URL of the page this author is on
  organizationId: string // @id of the Organization node
  lang?: string
}

export function buildPerson(input: PersonInput): Record<string, unknown> {
  return {
    '@type': 'Person',
    '@id': `${input.pageUrl}#author`,
    name: input.name,
    worksFor: { '@id': input.organizationId },
  }
}
