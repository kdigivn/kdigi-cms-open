/**
 * Builds a Schema.org FAQPage JSON-LD object from FAQ items.
 * Maps to frontend getFAQSchema() shape in seo-utils.ts.
 */
export function buildFaqPage(
  faqs: Array<{ question?: string; answer?: string }>,
): Record<string, unknown> | null {
  if (!faqs?.length) return null
  // Keep only items with both a question and an answer. A Question lacking name
  // or acceptedAnswer.text is malformed and makes Google reject the WHOLE
  // FAQPage — drop the orphans so the valid Q&A still earns rich results.
  const mainEntity = faqs
    .filter(
      (f) =>
        f.question != null &&
        f.question.trim() !== '' &&
        f.answer != null &&
        f.answer.trim() !== '',
    )
    .map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    }))
  // No valid Q&A → no FAQPage node at all (an empty mainEntity is itself invalid).
  if (!mainEntity.length) return null
  // No '@context' here — this node is always nested inside a top-level @graph
  // (post subjectOf / product graph node), and inner graph nodes must omit @context.
  return {
    '@type': 'FAQPage',
    mainEntity,
  }
}
