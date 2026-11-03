/**
 * Keeps an afterChange hook's return value in sync with the row it just wrote.
 *
 * Payload stamps a fresh `updatedAt` on every write, and the document handed back to the
 * caller is the one produced by the OUTER write — collection afterChange hooks run after
 * that. So a hook that persists derived data through `payload.update()` leaves the stored
 * row one timestamp ahead of the API response.
 *
 * The admin editor remembers the `updatedAt` it received when saving and, on the next field
 * change, asks the server whether the stored row is newer. A mismatch is read as "somebody
 * else edited this document": the editor shows a blocking modal whose only action reloads
 * the form, discarding everything typed since the save.
 *
 * Any afterChange hook that writes back to its own document must return this merge, so the
 * response carries the timestamp that actually landed in the database.
 */
export function withPersistedUpdatedAt<T>(doc: T, persisted: unknown): T {
  const updatedAt = (persisted as { updatedAt?: unknown } | null | undefined)?.updatedAt
  // A write that returned no usable timestamp leaves the doc untouched — better a stale
  // response than one claiming a timestamp the row does not have.
  if (typeof updatedAt !== 'string' || updatedAt === '') return doc
  return { ...doc, updatedAt }
}
