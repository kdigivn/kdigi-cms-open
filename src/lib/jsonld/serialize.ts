/**
 * Single serialization point for JSON-LD that gets embedded into a
 * <script type="application/ld+json"> tag by the frontend.
 *
 * Escapes every "<" as its JSON unicode form (<) so a "</script>" appearing
 * inside any string value (titles, breadcrumb text, WP-sourced descriptions) cannot
 * break out of the script element — a stored-XSS vector. JSON parsers decode <
 * back to "<", so structured-data validity is preserved.
 *
 * BOTH the generate-jsonld afterChange hook and the bulk regen importer MUST use this
 * — serializing in two places previously let one path skip the escape.
 */
export function serializeJsonLd(graph: unknown): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c')
}

/**
 * Serialize JSON-LD already wrapped in a <script type="application/ld+json"> tag —
 * the exact shape WordPress/RankMath store and the frontend injects verbatim, so no
 * consumer needs to wrap it. Safe because serializeJsonLd escapes every "<" inside the
 * payload (so an embedded "</script>" cannot break out of the element).
 */
export function serializeJsonLdScript(graph: unknown): string {
  return `<script type="application/ld+json">${serializeJsonLd(graph)}</script>`
}
