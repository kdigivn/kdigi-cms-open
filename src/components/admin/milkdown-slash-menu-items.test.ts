import assert from 'node:assert/strict'
import test from 'node:test'

import { requireSlashMenuCommand, SLASH_MENU_GROUPS } from './milkdown-slash-menu-items'

/**
 * Pins the slash menu's single source of truth (phase 5, SP2-2). This replaces the
 * coverage that `milkdown-slash-menu-config.test.ts` gave the Crepe adapter: the ids,
 * order, grouping and registry resolution below are exactly what the owned menu renders
 * (and what the parity matrix asserts against in the browser), so a registry rename can
 * no longer silently drop an item from the menu.
 */

test('the menu has the two Lark sections in order: basics then insert', () => {
  assert.deepEqual(
    SLASH_MENU_GROUPS.map((group) => [group.id, group.label]),
    [
      ['basics', 'Cơ bản/Basics'],
      ['insert', 'Chèn/Common'],
    ],
  )
})

test('basics lists the block types in the Lark-parity order', () => {
  assert.deepEqual(
    SLASH_MENU_GROUPS[0]?.items.map((item) => item.id),
    [
      'paragraph',
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
      'bulletList',
      'orderedList',
      'taskList',
      'codeBlock',
      'quote',
      'divider',
    ],
  )
})

test('insert lists link, table and the interactive image item', () => {
  assert.deepEqual(
    SLASH_MENU_GROUPS[1]?.items.map((item) => item.id),
    ['link', 'table', 'image'],
  )
})

test('every item carries a label and an icon, and ids are unique across groups', () => {
  const items = SLASH_MENU_GROUPS.flatMap((group) => group.items)
  for (const item of items) {
    assert.ok(item.label.length > 0, `${item.id}: missing label`)
    assert.match(item.icon, /<svg[\s>]/, `${item.id}: icon must be inline SVG markup`)
  }
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, 'duplicate item id')
})

test('only the image item is interactive (the media modal supplies its src/alt)', () => {
  const interactive = SLASH_MENU_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.commandId === null,
  )
  assert.deepEqual(
    interactive.map((item) => item.id),
    ['image'],
  )
})

test('every other item resolves to a runnable registry command', () => {
  for (const item of SLASH_MENU_GROUPS.flatMap((group) => group.items)) {
    if (item.commandId === null) continue
    const command = requireSlashMenuCommand(item.commandId)
    assert.equal(command.id, item.commandId)
    assert.equal(typeof command.run, 'function', `${item.id}: registry command must run`)
  }
})

test('an unknown registry id fails loudly instead of dropping the item', () => {
  assert.throws(() => requireSlashMenuCommand('does-not-exist'), /unknown command id/)
})
