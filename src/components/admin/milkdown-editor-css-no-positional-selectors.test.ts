import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Automated gate for the Lark editor stabilization plan's phase-04
 * requirement: no CSS selector in the Milkdown editor stylesheets may infer
 * command identity from sibling order/position (`nth-of-type`/`nth-child`).
 * Phase 1 recorded 11 such occurrences (7 toggling the "Turn Into" active
 * item, 3 bolding specific mark buttons, 1 in TS outside-click detection —
 * see `reports/phase-01-baseline-inventory.md` §3) as a `test.fixme` in
 * `e2e/milkdown-editor-behavior-regressions.spec.ts`; this replaces that
 * fixme with a real, always-on check so the pattern cannot silently
 * reappear in a future edit.
 */
const adminDir = path.dirname(fileURLToPath(import.meta.url))

const POSITIONAL_SELECTOR_PATTERN = /nth-of-type|nth-child/i

function listMilkdownCssFiles(): string[] {
  return readdirSync(adminDir)
    .filter((name) => name.startsWith('milkdown-') && name.endsWith('.css'))
    .sort()
}

test('no milkdown-*.css file uses nth-of-type/nth-child (sibling-position command identity)', () => {
  const cssFiles = listMilkdownCssFiles()
  assert.ok(cssFiles.length > 0, 'expected at least one milkdown-*.css file to scan')

  const offenders: { file: string; lineNumber: number; line: string }[] = []
  for (const file of cssFiles) {
    const contents = readFileSync(path.join(adminDir, file), 'utf-8')
    contents.split('\n').forEach((line, index) => {
      if (POSITIONAL_SELECTOR_PATTERN.test(line)) {
        offenders.push({ file, lineNumber: index + 1, line: line.trim() })
      }
    })
  }

  assert.deepEqual(
    offenders,
    [],
    `found positional (nth-of-type/nth-child) selectors: ${JSON.stringify(offenders, null, 2)}`,
  )
})
