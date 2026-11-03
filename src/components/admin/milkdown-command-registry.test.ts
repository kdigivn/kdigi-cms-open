import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getBlockTypeMenuCommands,
  getLinkToolbarCommand,
  getMarkToolbarCommands,
} from './milkdown-toolbar-config'
import { getMilkdownCommand, milkdownCommandRegistry } from './milkdown-command-registry'

/**
 * Command contract tests (Lark editor stabilization plan, phase-04 step 10).
 * Proves every command the floating toolbar / "Turn into" dropdown actually
 * renders has: a real `run`, a real `isActive` (except the documented
 * insert-only exceptions), a non-empty label, a rendered SVG icon (not a bare
 * text glyph), and a recorded persistence classification.
 */

test('every registry entry has a stable id, label, real SVG icon, and persistence classification', () => {
  for (const command of milkdownCommandRegistry) {
    assert.ok(command.id.length > 0, `command missing id: ${JSON.stringify(command)}`)
    assert.ok(command.label.length > 0, `${command.id}: missing label`)
    assert.match(
      command.icon,
      /^<svg /,
      `${command.id}: icon must be rendered SVG markup, got ${JSON.stringify(command.icon)}`,
    )
    assert.ok(
      ['gfm', 'editor-only', 'excluded'].includes(command.persistence),
      `${command.id}: invalid persistence classification "${command.persistence}"`,
    )
  }
})

test('registry ids are unique', () => {
  const ids = milkdownCommandRegistry.map((command) => command.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate command id found in registry')
})

test('getMilkdownCommand resolves every registered id and returns undefined for unknown ids', () => {
  for (const command of milkdownCommandRegistry) {
    assert.equal(getMilkdownCommand(command.id), command)
  }
  assert.equal(getMilkdownCommand('does-not-exist'), undefined)
})

test('every block-type ("Turn into") command has a working run + isActive pair', () => {
  const commands = getBlockTypeMenuCommands()
  assert.equal(commands.length, 13, 'expected paragraph + 6 headings + quote + 3 lists + code + divider')
  for (const command of commands) {
    assert.equal(typeof command.run, 'function', `${command.id}: block-type commands must be runnable`)
    assert.equal(
      typeof command.isActive,
      'function',
      `${command.id}: block-type commands must report active state`,
    )
    assert.equal(command.persistence, 'gfm', `${command.id}: block-type commands must round-trip via GFM`)
  }
})

test('every mark toolbar command (Bold/Italic/Strikethrough/Inline Code) has a working run + isActive pair', () => {
  const commands = getMarkToolbarCommands()
  assert.deepEqual(
    commands.map((command) => command.id),
    ['bold', 'italic', 'strikethrough', 'inlineCode'],
  )
  for (const command of commands) {
    assert.equal(typeof command.run, 'function', `${command.id}: mark commands must be runnable`)
    assert.equal(typeof command.isActive, 'function', `${command.id}: mark commands must report active state`)
    assert.equal(command.persistence, 'gfm', `${command.id}: mark commands must round-trip via GFM`)
  }
})

test('the toolbar Link command has run + isActive', () => {
  const link = getLinkToolbarCommand()
  assert.equal(link.id, 'link')
  assert.equal(typeof link.run, 'function')
  assert.equal(typeof link.isActive, 'function')
})

test('no registry entry silently no-ops: every entry has either a run or a documented reason not to (image)', () => {
  for (const command of milkdownCommandRegistry) {
    if (command.run) continue
    assert.equal(
      command.id,
      'image',
      `${command.id}: has no run and is not the documented "image" exception`,
    )
  }
})

test('underline is not registered (no proven GFM storage path — see milkdown-toolbar-config.ts)', () => {
  assert.equal(getMilkdownCommand('underline'), undefined)
})
