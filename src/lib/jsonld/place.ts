/**
 * Builds the standalone Schema.org Place node Rank Math emits next to the
 * Organization (`{siteUrl}/#place`): the organization's physical location
 * (address + GeoCoordinates + a Google Maps link). Emitted so kdigi-cms graphs
 * match the WordPress output for migrated tenants; returns null when the site
 * has neither an address nor coordinates, so tenants without a location are
 * unaffected.
 */
export interface PlaceInput {
  siteUrl: string
  address?: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  }
  geo?: { latitude: number; longitude: number }
}

export function buildPlace(input: PlaceInput): Record<string, unknown> | null {
  const address = input.address
    ? Object.fromEntries(Object.entries(input.address).filter(([, v]) => v != null && v !== ''))
    : {}
  const hasAddress = Object.keys(address).length > 0
  if (!hasAddress && !input.geo) return null

  const node: Record<string, unknown> = {
    '@type': 'Place',
    '@id': `${input.siteUrl}/#place`,
  }
  if (input.geo) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    }
    node.hasMap = `https://www.google.com/maps/search/?api=1&query=${input.geo.latitude},${input.geo.longitude}`
  }
  if (hasAddress) node.address = { '@type': 'PostalAddress', ...address }
  return node
}
