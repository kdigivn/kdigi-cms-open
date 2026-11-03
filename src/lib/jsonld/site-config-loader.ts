/**
 * Loads site-level config needed for JSON-LD generation from the sites collection.
 *
 * Called once per afterChange hook invocation. Result is not cached — Payload
 * local API is fast enough for a single extra read per save.
 *
 * Resolution is explicit-first: the editor-managed `knowledgeGraph` group and
 * `socialProfiles` array win per-field; when a field is blank the loader falls
 * back to the legacy heuristics (manifest/branding/contact/footer scraping) so
 * existing sites keep their current JSON-LD output until the new fields are filled.
 *
 * Returns null if no matching site doc is found so callers fall back gracefully.
 */
import type { BasePayload, PayloadRequest } from 'payload'

import { mediaUrlOf } from '../seo/og-image-fallback'

export interface SiteJsonLdConfig {
  siteUrl: string          // e.g. https://example.com
  orgName: string          // human display name, e.g. Example Site
  logoUrl: string | null
  logoWidth: number | null
  logoHeight: number | null
  sameAs: string[]
  telephone: string | null
  address: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  } | null
  lang: string
  /** Extra schema types prepended before 'Organization' (e.g. ['TravelAgency']). */
  additionalTypes: string[]
  /** Per-tenant default og:image URL (Sites.seoDefaults.ogImage) — JSON-LD image fallback. */
  defaultOgImageUrl: string | null
  // ── Explicit Knowledge Graph fields (undefined when unset / falling back) ──
  legalName?: string
  email?: string
  description?: string
  priceRange?: string
  geo?: { latitude: number; longitude: number }
  /**
   * Structured opening hours → emitted as schema.org OpeningHoursSpecification
   * nodes (modern form). dayOfWeek uses full schema.org day names ('Monday'…).
   */
  openingHoursSpecification?: Array<{
    dayOfWeek: string[]
    opens: string
    closes: string
  }>
  /**
   * Minimum review count required for aggregateRating to emit.
   * From Sites.knowledgeGraph.minReviewsForAggregate (Phase 4.1).
   * Defaults to 10 when not set.
   */
  minReviewsForAggregate?: number
  /** ISO 8601 founding date of the organization. */
  foundingDate?: string
  /** Founders as array of { name }. */
  founders?: Array<{ name: string }>
  /** Areas served as array of { '@type', name }. */
  areaServed?: Array<{ '@type': string; name: string }>
  /** BCP 47 language tags the organization operates in. */
  knowsLanguage?: string[]
  /** Contact point details. */
  contactPoint?: {
    telephone?: string
    email?: string
    contactType?: string
    availableLanguage?: string[]
    hoursAvailable?: string
  }
  /** URL of the visible return/exchange policy page; no schema category is inferred from URL alone. */
  returnPolicyUrl?: string
  /** Search action URL template, e.g. '/search?q={search_term_string}'. Emits WebSite SearchAction. */
  searchActionUrl?: string
  /** Wikidata Q-id (e.g. Q12345) — converted to full Wikidata URL in sameAs. */
  wikidataId?: string
  /** Wikipedia article URL for the brand/organization. */
  wikipediaUrl?: string
  /** YouTube channel URL. */
  youtubeChannelUrl?: string
  /** TikTok account URL. */
  tiktokUrl?: string
  /** Additional branch offices — used to emit per-location LocalBusiness JSON-LD nodes. */
  additionalOffices?: AdditionalOffice[]
}

/** A single branch office used to emit per-location LocalBusiness JSON-LD nodes. */
export interface AdditionalOffice {
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
}

/** Parse a localized field which may be a JSON string or plain string. */
function parseLocalizedField(value: unknown, lang: string): string {
  if (typeof value === 'string') {
    // Could be JSON-encoded locale map
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value) as Record<string, string>
        return parsed[lang] || parsed['vi'] || Object.values(parsed)[0] || ''
      } catch {
        return value
      }
    }
    return value
  }
  if (value && typeof value === 'object') {
    const map = value as Record<string, string>
    return map[lang] || map['vi'] || Object.values(map)[0] || ''
  }
  return ''
}

const trimmed = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

/** schema.org day tokens, in week order, for openingHours serialization. */
const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Map the CMS 2-letter day token → full schema.org day name for OpeningHoursSpecification. */
const DAY_TOKEN_TO_NAME: Record<string, string> = {
  Mo: 'Monday',
  Tu: 'Tuesday',
  We: 'Wednesday',
  Th: 'Thursday',
  Fr: 'Friday',
  Sa: 'Saturday',
  Su: 'Sunday',
}

/**
 * Map businessType select → the `additionalTypes` prepended before 'Organization'.
 * 'Organization' → [] (plain), 'TravelAgency'/others → [type]. Blank defaults to
 * 'TravelAgency' so existing sites keep their current ['TravelAgency','Organization'].
 */
function businessTypeToAdditionalTypes(businessType: unknown): string[] {
  const t = trimmed(businessType) ?? 'TravelAgency'
  if (t === 'Organization') return []
  return [t]
}

/** Convert Sites.knowledgeGraph.additionalOffices[] into typed AdditionalOffice[]. */
function loadAdditionalOffices(
  raw: unknown,
): AdditionalOffice[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const offices = raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => {
      const geo = (o.geo as Record<string, unknown>) ?? {}
      const lat = typeof geo.latitude === 'number' ? geo.latitude : undefined
      const lng = typeof geo.longitude === 'number' ? geo.longitude : undefined
      return {
        gbpPlaceId: o.gbpPlaceId as string | null | undefined,
        name: (o.name as string) ?? '',
        address: (o.address as string) ?? '',
        addressLocality: o.addressLocality as string | undefined,
        addressRegion: o.addressRegion as string | undefined,
        postalCode: o.postalCode as string | undefined,
        addressCountry: o.addressCountry as string | undefined,
        telephone: o.telephone as string | null | undefined,
        openingHours: o.openingHours as string | undefined,
        latitude: lat,
        longitude: lng,
      }
    })
    .filter((o) => o.name.trim().length > 0)
  return offices.length ? offices : undefined
}

/**
 * Convert one structured openingHours row → an OpeningHoursSpecification input
 * with full schema.org day names, or null to skip incomplete rows.
 */
function toOpeningHoursSpecRow(
  row: Record<string, unknown>,
): { dayOfWeek: string[]; opens: string; closes: string } | null {
  const days = Array.isArray(row.dayOfWeek)
    ? (row.dayOfWeek as unknown[]).filter((d): d is string => typeof d === 'string')
    : []
  const opens = trimmed(row.opens)
  const closes = trimmed(row.closes)
  if (!days.length || !opens || !closes) return null
  const dayOfWeek = [...days]
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    .map((d) => DAY_TOKEN_TO_NAME[d] ?? d)
  return { dayOfWeek, opens, closes }
}

/**
 * Loads site JSON-LD config for a tenant, resolved by the Sites doc id.
 * The sites collection is the tenant root (one doc per tenant), so resolving by id
 * guarantees the correct per-tenant Organization/WebSite data with no cross-tenant leak.
 */
export async function loadSiteJsonLdConfig(
  payload: BasePayload,
  siteId: string | number,
  req?: PayloadRequest,
): Promise<SiteJsonLdConfig | null> {
  try {
    if (!siteId) return null

    // req threads the caller's transaction into this findByID; without it the
    // nested read grabs a second pool connection while the afterChange write
    // transaction holds the first, deadlocking the pool under concurrency.
    const site = (await payload
      .findByID({
        collection: 'sites',
        id: siteId,
        overrideAccess: true,
        depth: 1, // depth=1 to inline branding.logo + knowledgeGraph.logo (media objects)
        req,
      })
      .catch(() => null)) as unknown as Record<string, unknown> | null
    if (!site) return null

    const lang = (site.defaultLanguage as string) ?? 'vi'
    const domain = (site.domain as string) ?? ''
    const siteUrl = `https://${domain}`

    const kg = (site.knowledgeGraph as Record<string, unknown>) ?? {}

    // ── Org name: explicit kg.name → manifest.name heuristic → domain ──────────
    const manifest = (site.manifest as Record<string, unknown>) ?? {}
    const orgName =
      parseLocalizedField(kg.name, lang) ||
      parseLocalizedField(manifest.name, lang) ||
      domain

    // ── Logo: explicit kg.logo → branding.logo heuristic ──────────────────────
    const resolveLogo = (
      logo: Record<string, unknown> | null | undefined,
    ): { url: string | null; width: number | null; height: number | null } => {
      if (logo && typeof logo === 'object') {
        return {
          url: (logo.externalUrl as string) ?? (logo.url as string) ?? null,
          width: (logo.width as number) ?? null,
          height: (logo.height as number) ?? null,
        }
      }
      return { url: null, width: null, height: null }
    }
    const kgLogo = resolveLogo(kg.logo as Record<string, unknown> | null | undefined)
    const branding = (site.branding as Record<string, unknown>) ?? {}
    const brandingLogo = resolveLogo(branding.logo as Record<string, unknown> | null | undefined)
    const logo = kgLogo.url ? kgLogo : brandingLogo

    // ── Default og:image: Sites.seoDefaults.ogImage (per-tenant social share fallback) ──
    const seoDefaults = (site.seoDefaults as Record<string, unknown>) ?? {}
    const defaultOgImageUrl = mediaUrlOf(seoDefaults.ogImage) ?? null

    // ── Telephone: telephoneE164 (Phase 4) → telephone fallback ──────────────
    // telephoneE164 is populated by the normalizeTelephoneE164 beforeChange hook
    // on every Sites doc save. Use it as primary; fall back to raw telephone
    // only when E.164 derivation has not yet run for a doc (pre-Phase-1 backfill).
    let telephone: string | null = null
    const telephoneE164 = trimmed(kg.telephoneE164)
    const telephoneRaw = trimmed(kg.telephone)
    if (telephoneE164) {
      telephone = telephoneE164
    } else if (telephoneRaw) {
      telephone = telephoneRaw.replace(/\s+/g, '')
    } else {
      const rightSide =
        ((site.contact as Record<string, unknown>)?.rightSide as Array<Record<string, unknown>>) ?? []
      const phoneLabel = rightSide.find((r) => r.icon === 'phone')?.label as string | undefined
      telephone =
        phoneLabel && /[\d\s.()+\-]{6,}/.test(phoneLabel) ? phoneLabel.replace(/\s+/g, '') : null
    }

    // ── sameAs: socialProfiles[].url → contact.headerIcons heuristic ──────────
    const socialProfiles = (site.socialProfiles as Array<Record<string, unknown>>) ?? []
    const explicitSameAs = socialProfiles
      .map((s) => trimmed(s.url))
      .filter((u): u is string => !!u && u.startsWith('http'))
    let sameAs: string[]
    if (explicitSameAs.length) {
      sameAs = [...explicitSameAs]
    } else {
      const headerIcons =
        ((site.contact as Record<string, unknown>)?.headerIcons as Array<Record<string, unknown>>) ?? []
      sameAs = headerIcons
        .map((h) => h.url as string)
        .filter((u) => u && u.startsWith('http') && !u.includes(domain))
    }
    // ── Authority sameAs: Wikidata, Wikipedia, YouTube, TikTok ───────────────
    const wikidataId = trimmed(kg.wikidataId)
    const wikipediaUrl = trimmed(kg.wikipediaUrl)
    const youtubeChannelUrl = trimmed(kg.youtubeChannelUrl)
    const tiktokUrl = trimmed(kg.tiktokUrl)
    if (wikidataId) sameAs.push(`https://www.wikidata.org/wiki/${wikidataId}`)
    if (wikipediaUrl) sameAs.push(wikipediaUrl)
    if (youtubeChannelUrl) sameAs.push(youtubeChannelUrl)
    if (tiktokUrl) sameAs.push(tiktokUrl)

    // ── Address: explicit kg.address (any subfield set) → footer heuristic ────
    let address: SiteJsonLdConfig['address'] = null
    const kgAddress = (kg.address as Record<string, unknown>) ?? {}
    const explicitAddr = {
      streetAddress: trimmed(kgAddress.streetAddress),
      addressLocality: trimmed(kgAddress.addressLocality),
      addressRegion: trimmed(kgAddress.addressRegion),
      postalCode: trimmed(kgAddress.postalCode),
      addressCountry: trimmed(kgAddress.addressCountry),
    }
    const hasExplicitAddr = Object.entries(explicitAddr).some(
      ([k, v]) => v != null && k !== 'addressCountry',
    )
    if (hasExplicitAddr) {
      address = Object.fromEntries(
        Object.entries({ ...explicitAddr, addressCountry: explicitAddr.addressCountry ?? 'VN' }).filter(
          ([, v]) => v != null,
        ),
      ) as SiteJsonLdConfig['address']
    } else {
      const footerAddr =
        ((site.footer as Record<string, unknown>)?.address as Array<Record<string, unknown>>) ?? []
      const addressText = parseLocalizedField(footerAddr[0]?.text, lang) || ''
      address = addressText ? { streetAddress: addressText, addressCountry: 'VN' } : null
    }

    // ── Geo (explicit only) ───────────────────────────────────────────────────
    const kgGeo = (kg.geo as Record<string, unknown>) ?? {}
    const latitude = typeof kgGeo.latitude === 'number' ? kgGeo.latitude : undefined
    const longitude = typeof kgGeo.longitude === 'number' ? kgGeo.longitude : undefined
    const geo = latitude != null && longitude != null ? { latitude, longitude } : undefined

    // ── OpeningHours (explicit only) → OpeningHoursSpecification rows ──────────
    const rows = Array.isArray(kg.openingHours)
      ? (kg.openingHours as unknown[]).filter(
          (r): r is Record<string, unknown> => !!r && typeof r === 'object',
        )
      : []
    const openingHoursSpecification = rows
      .map(toOpeningHoursSpecRow)
      .filter(
        (s): s is { dayOfWeek: string[]; opens: string; closes: string } => s != null,
      )

    // ── foundingDate (ISO 8601) ───────────────────────────────────────────────
    const foundingDate = trimmed(kg.foundingDate)

    // ── founders ─────────────────────────────────────────────────────────────
    const foundersRaw = Array.isArray(kg.founders) ? kg.founders : []
    const founders = foundersRaw
      .filter((f: unknown): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({ name: (f.name as string) ?? '' }))
      .filter((f) => f.name)

    // ── areaServed ───────────────────────────────────────────────────────────
    const areaServedRaw = Array.isArray(kg.areaServed) ? kg.areaServed : []
    const areaServed = areaServedRaw
      .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({
        '@type': (a.type as string) ?? 'Place',
        name: (a.name as string) ?? '',
      }))
      .filter((a) => a.name)

    // ── knowsLanguage (BCP 47 tags) ───────────────────────────────────────────
    const knowsLanguage = Array.isArray(kg.knowsLanguage)
      ? (kg.knowsLanguage as string[]).map((l) => String(l)).filter(Boolean)
      : []

    // ── contactPoint ──────────────────────────────────────────────────────────
    const contactPointRaw = (kg.contactPoint as Record<string, unknown> | null) ?? null
    const contactPoint = contactPointRaw && typeof contactPointRaw === 'object'
      ? {
          telephone: contactPointRaw.telephone as string | undefined,
          email: contactPointRaw.email as string | undefined,
          contactType: contactPointRaw.contactType as string | undefined,
          availableLanguage: Array.isArray(contactPointRaw.availableLanguage)
            ? (contactPointRaw.availableLanguage as string[]).filter(Boolean)
            : undefined,
          hoursAvailable: contactPointRaw.hoursAvailable as string | undefined,
        }
      : undefined

    // ── returnPolicyUrl ───────────────────────────────────────────────────────
    const returnPolicyUrl = trimmed(kg.returnPolicyUrl)

    // ── searchActionUrl ──────────────────────────────────────────────────────
    const searchActionUrl = trimmed(kg.searchActionUrl)

    return {
      siteUrl,
      orgName,
      logoUrl: logo.url,
      logoWidth: logo.width,
      logoHeight: logo.height,
      sameAs,
      telephone,
      address,
      lang,
      additionalTypes: businessTypeToAdditionalTypes(kg.businessType),
      defaultOgImageUrl,
      legalName: trimmed(kg.legalName),
      email: trimmed(kg.email),
      description: parseLocalizedField(kg.description, lang) || undefined,
      priceRange: trimmed(kg.priceRange),
      geo,
      openingHoursSpecification: openingHoursSpecification.length
        ? openingHoursSpecification
        : undefined,
      minReviewsForAggregate: kg.minReviewsForAggregate as number | undefined,
      foundingDate,
      founders: founders.length ? founders : undefined,
      areaServed: areaServed.length ? areaServed : undefined,
      knowsLanguage: knowsLanguage.length ? knowsLanguage : undefined,
      contactPoint,
      returnPolicyUrl,
      searchActionUrl,
      wikidataId: trimmed(kg.wikidataId),
      wikipediaUrl: trimmed(kg.wikipediaUrl),
      youtubeChannelUrl: trimmed(kg.youtubeChannelUrl),
      tiktokUrl: trimmed(kg.tiktokUrl),
      // ── additionalOffices (multi-location LocalBusiness) ──────────────────
      additionalOffices: loadAdditionalOffices(kg.additionalOffices),
    }
  } catch {
    return null
  }
}
