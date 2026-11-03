import assert from 'node:assert/strict'
import test from 'node:test'

import { detectSlashMenu, INACTIVE_SLASH_MENU, type SlashContext } from './milkdown-slash-menu-plugin'

/**
 * Pure trigger-detection tests (phase 5, SP2-2). The ProseMirror plugin shell is a
 * thin `applyTransaction` wrapper over `detectSlashMenu`, so all the rules that decide
 * WHEN the menu opens live here and are pinned without an editor instance — the
 * end-to-end path (real keystrokes, real DOM) is covered by the parity-matrix rows.
 */

function context(overrides: Partial<SlashContext> = {}): SlashContext {
  return {
    blockStart: 10,
    blockType: 'paragraph',
    textBefore: '/',
    textAfterLength: 0,
    cursor: 11,
    ...overrides,
  }
}

test('a "/" at the start of an empty block opens the menu with an empty query', () => {
  const state = detectSlashMenu(context())
  assert.equal(state.visible, true)
  assert.equal(state.from, 10, 'from is the doc position of the "/"')
  assert.equal(state.to, 11, 'to is the cursor')
  assert.equal(state.query, '')
  assert.equal(state.blockHasOtherContent, false)
  assert.equal(state.selectedIndex, 0)
})

test('an inline trigger after whitespace opens the menu and keeps the text before it', () => {
  // "Keep this paragraph /ta" with the cursor right after "ta".
  const textBefore = 'Keep this paragraph /ta'
  const state = detectSlashMenu(
    context({ textBefore, cursor: 10 + textBefore.length, blockStart: 10 }),
  )
  assert.equal(state.visible, true)
  assert.equal(state.query, 'ta')
  assert.equal(state.from, 10 + textBefore.indexOf('/'))
  assert.equal(state.blockHasOtherContent, true, 'text precedes the trigger → insert below, do not convert')
})

test('text after the cursor also counts as other content (RT-10: it must survive)', () => {
  // "abc /h1xyz" with the cursor before "xyz".
  const textBefore = 'abc /h1'
  const state = detectSlashMenu(context({ textBefore, cursor: 10 + textBefore.length, textAfterLength: 3 }))
  assert.equal(state.visible, true)
  assert.equal(state.query, 'h1')
  assert.equal(state.blockHasOtherContent, true)
})

test('a "/" that does not start a word does not open the menu (URLs, paths)', () => {
  for (const textBefore of ['see https://x/y', 'docs/2609', 'a/b']) {
    assert.equal(
      detectSlashMenu(context({ textBefore, cursor: 10 + textBefore.length })).visible,
      false,
      `"${textBefore}" must not trigger`,
    )
  }
})

test('the LAST word-starting "/" wins when several are present', () => {
  const textBefore = 'see /first and /sec'
  const state = detectSlashMenu(context({ textBefore, cursor: 10 + textBefore.length }))
  assert.equal(state.visible, true)
  assert.equal(state.query, 'sec')
  assert.equal(state.from, 10 + textBefore.lastIndexOf('/'))
})

test('queries may contain spaces (Lark-style multi-word search)', () => {
  const textBefore = '/heading 1'
  const state = detectSlashMenu(context({ textBefore, cursor: 10 + textBefore.length }))
  assert.equal(state.visible, true)
  assert.equal(state.query, 'heading 1')
})

test('non-textblock blocks never trigger (code blocks keep their literal slashes)', () => {
  for (const blockType of ['code_block', 'table_cell', 'blockquote']) {
    assert.equal(
      detectSlashMenu(context({ blockType })).visible,
      false,
      `${blockType} must not trigger`,
    )
  }
})

test('headings trigger, like paragraphs', () => {
  const textBefore = 'Title /h'
  const state = detectSlashMenu(context({ blockType: 'heading', textBefore, cursor: 10 + textBefore.length }))
  assert.equal(state.visible, true)
  assert.equal(state.query, 'h')
})

test('an inactive result carries the inert shape callers spread into', () => {
  assert.deepEqual(detectSlashMenu(context({ blockType: 'code_block' })), INACTIVE_SLASH_MENU)
  assert.equal(INACTIVE_SLASH_MENU.visible, false)
})
