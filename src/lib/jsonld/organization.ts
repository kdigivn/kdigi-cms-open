/**
 * Builds a Schema.org Organization (+ TravelAgency) JSON-LD node.
 *
 * Rank Math emits ["<BusinessType>","Organization"] for local-business sites (see Sites.knowledgeGraph.businessType).
 * @id uses site root URL + #organization anchor.
 * Logo cross-references the ImageObject node by @id (#logo anchor).
 */
export interface OrganizationInput {
  name: string
  siteUrl: string // canonical site root, e.g. https://example.com
  logoUrl?: string
  logoWidth?: number
  logoHeight?: number
  email?: string
  telephone?: string
  address?: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  }
  sameAs?: string[]
  description?: string
  priceRange?: string
  legalName?: string
  vatID?: string
  /**
   * Opening hours as schema.org OpeningHoursSpecification rows. dayOfWeek uses
   * full day names ('Monday'…). Emitted as the modern OpeningHoursSpecification
   * node array rather than the legacy `openingHours` string form.
   */
  openingHoursSpecification?: Array<{
    dayOfWeek: string[]
    opens: string
    closes: string
  }>
  /** Geo coordinates → emitted as a nested GeoCoordinates node (valid on LocalBusiness/Place subtypes). */
  geo?: { latitude: number; longitude: number }
  placeId?: string // @id of Place node, if any
  lang?: string
  /** Extra schema types to prepend (e.g. 'TravelAgency'). Organization always included. */
  additionalTypes?: string[]
  /** ISO 8601 founding date, e.g. '2015-06-01'. */
  foundingDate?: string
  /** Founders as array of { name }. */
  founders?: Array<{ name: string }>
  /** Areas served as array of { '@type': 'State'|'Country'|'City', name }. */
  areaServed?: Array<{ '@type': string; name: string }>
  /** Languages the organization knows/operates in (BCP 47 tags, e.g. 'vi', 'en'). */
  knowsLanguage?: string[]
  /** Contact details for the organization. */
  contactPoint?: {
    telephone?: string
    email?: string
    contactType?: string
    availableLanguage?: string[]
    hoursAvailable?: string
  }
}

export function buildOrganization(input: OrganizationInput): Record<string, unknown> {
  const orgId = `${input.siteUrl}/#organization`
  const logoId = `${input.siteUrl}/#logo`

  const node: Record<string, unknown> = {
    '@type': input.additionalTypes?.length
      ? [...input.additionalTypes, 'Organization']
      : 'Organization',
    '@id': orgId,
    name: input.name,
    url: input.siteUrl,
  }

  if (input.sameAs?.length) node.sameAs = input.sameAs
  if (input.email) node.email = input.email
  if (input.telephone) node.telephone = input.telephone
  if (input.description) node.description = input.description
  if (input.priceRange) node.priceRange = input.priceRange
  if (input.legalName) node.legalName = input.legalName
  if (input.vatID) node.vatID = input.vatID
  if (input.openingHoursSpecification?.length) {
    node.openingHoursSpecification = input.openingHoursSpecification.map((r) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: r.dayOfWeek,
      opens: r.opens,
      closes: r.closes,
    }))
  }

  if (input.address) {
    node.address = {
      '@type': 'PostalAddress',
      ...Object.fromEntries(
        Object.entries(input.address).filter(([, v]) => v != null && v !== ''),
      ),
    }
  }

  if (input.logoUrl) {
    node.logo = {
      '@type': 'ImageObject',
      '@id': logoId,
      url: input.logoUrl,
      contentUrl: input.logoUrl,
      caption: input.name,
      inLanguage: input.lang ?? 'vi',
      ...(input.logoWidth ? { width: input.logoWidth } : {}),
      ...(input.logoHeight ? { height: input.logoHeight } : {}),
    }
    node.image = { '@id': logoId }
  }

  if (input.geo) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    }
  }

  if (input.placeId) node.location = { '@id': input.placeId }
  if (input.foundingDate) node.foundingDate = input.foundingDate
  if (input.founders?.length) {
    node.founders = input.founders.map((f) => ({ '@type': 'Person', name: f.name }))
  }
  if (input.areaServed?.length) {
    node.areaServed = input.areaServed.map((a) => ({ '@type': a['@type'], name: a.name }))
  }
  if (input.knowsLanguage?.length) node.knowsLanguage = input.knowsLanguage
  if (input.contactPoint) {
    node.contactPoint = {
      '@type': 'ContactPoint',
      ...Object.fromEntries(
        Object.entries(input.contactPoint).filter(
          ([, v]) =>
            v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
        ),
      ),
    }
  }

  return node
}

/** Slugify a string for use in a URI-safe @id fragment. */
function slugifyOfficeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Build a Schema.org LocalBusiness JSON-LD node for a branch office.
 *
 * Each office gets a distinct @id so JSON-LD processors treat them as separate
 * entities within the same @graph.
 *
 * @param office  - AdditionalOffice from Sites.knowledgeGraph.additionalOffices
 * @param siteUrl - Canonical site root, e.g. https://example.com
 * @param orgId   - @id of the parent Organization node, e.g. https://example.com/#organization
 */
export function buildLocalBusiness(
  office: {
    gbpPlaceId?: string | null
    name: string
    address: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
    telephone?: string | null
    openingHours?: string
    latitude?: number
    longitude?: number
  },
  siteUrl: string,
  orgId: string,
): Record<string, unknown> {
  // Prefer gbpPlaceId as the most stable distinct identifier; fall back to slugified name.
  const officeIdFragment = office.gbpPlaceId?.trim()
    ? office.gbpPlaceId.trim()
    : slugifyOfficeName(office.name)
  const nodeId = `${siteUrl}/#local-business-${officeIdFragment}`

  const address: Record<string, string> = { '@type': 'PostalAddress' }
  if (office.address) address.addressLocality = office.addressLocality ?? office.address
  if (office.addressLocality) address.addressLocality = office.addressLocality
  if (office.addressRegion) address.addressRegion = office.addressRegion
  if (office.postalCode) address.postalCode = office.postalCode
  if (office.addressCountry) address.addressCountry = office.addressCountry
  else address.addressCountry = 'VN'

  const node: Record<string, unknown> = {
    '@type': 'LocalBusiness',
    '@id': nodeId,
    name: office.name,
    address,
    parentOrganization: { '@id': orgId },
  }

  if (office.telephone) node.telephone = office.telephone
  if (office.openingHours) node.openingHours = office.openingHours

  if (office.latitude != null && office.longitude != null) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: office.latitude,
      longitude: office.longitude,
    }
  }

  return node
}
