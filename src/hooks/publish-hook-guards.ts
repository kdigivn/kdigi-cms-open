/**
 * Shared context guards for hooks that trigger network side effects
 * (frontend revalidate, queued by trigger-revalidate.ts).
 *
 * The predicates live here so every such hook skips the same bulk-import/internal-write
 * contexts: an importer write phase or an internal JSON-LD re-save must not fire external requests.
 *
 * Flag meanings (set via `withScopedHookContext`, see src/hooks/scoped-hook-request.ts):
 *   `__suppressExternalPublishHooks`     importer write phase, destination not verified yet
 *   `__generatingJsonLd`                 internal nested update from generate-jsonld
 */
export function isPublishSideEffectSuppressed(
  context: Record<string, unknown> | undefined,
): boolean {
  return Boolean(context?.__suppressExternalPublishHooks)
}

/** Guards that specifically suppress frontend revalidation. */
export function isRevalidateSuppressed(context: Record<string, unknown> | undefined): boolean {
  return isPublishSideEffectSuppressed(context) || Boolean(context?.__generatingJsonLd)
}
