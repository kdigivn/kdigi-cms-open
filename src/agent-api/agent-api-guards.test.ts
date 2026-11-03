/**
 * Invariants of the agent surface that a careless edit would silently break:
 *   - ops run as the key owner (no `overrideAccess: true`) — allow-listed exceptions only;
 *   - every update honours admin edit locks (`overrideLock: false`; Payload's Local API default
 *     `true` would skip the check AND delete the editor's lock row);
 *   - every op that modifies an existing document demands an `expectedUpdatedAt` token.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { schemas } from './schemas'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f, text: readFileSync(path.join(DIR, f), 'utf8') }))

/** `payload-locked-documents` rows are not readable by editors; the lock check must see them. */
const OVERRIDE_ACCESS_ALLOWED: Record<string, true> = { 'locks.ts': true }

/** Call expressions `ctx.payload.<method>({ … })`, balanced on parentheses. */
function calls(text: string, method: string): string[] {
  const out: string[] = []
  const needle = `.payload.${method}(`
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    let depth = 0
    let j = i + needle.length - 1
    for (; j < text.length; j += 1) {
      if (text[j] === '(') depth += 1
      else if (text[j] === ')' && --depth === 0) break
    }
    out.push(text.slice(i, j + 1))
  }
  return out
}

describe('agent-api guards', () => {
  it('never bypasses access control outside the allow-list', () => {
    for (const { file, text } of sources) {
      if (OVERRIDE_ACCESS_ALLOWED[file]) continue
      assert.doesNotMatch(text, /overrideAccess:\s*true/, `${file} uses overrideAccess: true`)
    }
  })

  it('passes overrideLock: false on every update', () => {
    const updates = sources.flatMap(({ file, text }) => calls(text, 'update').map((c) => ({ file, c })))
    assert.ok(updates.length > 0)
    for (const { file, c } of updates) assert.match(c, /overrideLock:\s*false/, `${file}: ${c.slice(0, 80)}`)
  })

  it('requires expectedUpdatedAt on every op that changes an existing document', () => {
    const writes = ['updatePost', 'updatePage', 'setStatus', 'trashContent', 'restoreVersion', 'updateMediaAlt'] as const
    for (const name of writes) {
      const parsed = schemas[name].safeParse({ collection: 'posts', id: 1, versionId: 1, status: 'draft', alt: 'x' })
      assert.equal(parsed.success, false, `${name} accepted input without expectedUpdatedAt`)
      assert.ok(
        parsed.error?.issues.some((i) => i.path[0] === 'expectedUpdatedAt'),
        `${name} failed for another reason: ${parsed.error?.message}`,
      )
    }
  })
})
