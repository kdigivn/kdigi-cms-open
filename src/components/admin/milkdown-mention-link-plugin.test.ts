import assert from 'node:assert/strict'
import test from 'node:test'

import { Schema } from '@milkdown/kit/prose/model'

import {
  detectMentionLink,
  dismissMentionLink,
  getMentionLinkState,
  insertMentionLink,
  mentionLinkPlugin,
  type MentionContext,
} from './milkdown-mention-link-plugin'
import { EditorState, TextSelection } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'

function context(textBefore: string, overrides: Partial<MentionContext> = {}): MentionContext {
  return {
    blockStart: 1,
    blockType: 'paragraph',
    textBefore,
    cursor: 1 + textBefore.length,
    inCode: false,
    ...overrides,
  }
}

test('an @ at a word start opens the picker with the typed query and the @ position', () => {
  const state = detectMentionLink(context('Xem @lich tau'))
  assert.equal(state.visible, true)
  assert.equal(state.query, 'lich tau')
  assert.equal(state.from, 1 + 'Xem '.length)
  assert.equal(state.to, 1 + 'Xem @lich tau'.length)
})

test('an @ inside a word (e-mail address) never opens it', () => {
  assert.equal(detectMentionLink(context('write to an@email')).visible, false)
})

test('inline code, code blocks and an @ followed by a space do not open it', () => {
  assert.equal(detectMentionLink(context('@lich', { inCode: true })).visible, false)
  assert.equal(detectMentionLink(context('@lich', { blockType: 'code_block' })).visible, false)
  assert.equal(detectMentionLink(context('price @ 10')).visible, false)
})

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block', marks: '_' },
    text: { group: 'inline' },
  },
  marks: {
    link: { attrs: { href: {} }, inclusive: false },
  },
})

function createView(): EditorView {
  const doc = schema.node('doc', null, [schema.node('paragraph')])
  let state = EditorState.create({ doc, plugins: [mentionLinkPlugin()], selection: TextSelection.create(doc, 1) })
  return {
    get state() {
      return state
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction)
    },
  } as unknown as EditorView
}

function type(view: EditorView, text: string): void {
  view.dispatch(view.state.tr.insertText(text))
}

test('Escape dismisses that @ for good (typing more keeps it closed), a new @ opens again', () => {
  const view = createView()
  type(view, '@lich')
  assert.equal(getMentionLinkState(view.state).visible, true)

  dismissMentionLink(view)
  assert.equal(getMentionLinkState(view.state).visible, false)
  type(view, 'x')
  assert.equal(getMentionLinkState(view.state).visible, false, 'the dismissed @ must stay closed')

  type(view, ' @pha')
  const reopened = getMentionLinkState(view.state)
  assert.equal(reopened.visible, true)
  assert.equal(reopened.query, 'pha')
})

test('inserting replaces exactly @query with linked text and leaves plain typing after it', () => {
  const view = createView()
  type(view, 'Xem @lich')
  assert.equal(insertMentionLink(view, { title: 'Lịch tàu', href: '/lich-tau' }), true)

  type(view, ' ngay')
  const paragraph = view.state.doc.firstChild
  assert.equal(paragraph?.textContent, 'Xem Lịch tàu ngay')
  const linked: string[] = []
  paragraph?.forEach((node) => {
    if (node.marks.some((mark) => mark.type.name === 'link' && mark.attrs.href === '/lich-tau')) {
      linked.push(node.text ?? '')
    }
  })
  assert.deepEqual(linked, ['Lịch tàu'], 'only the title is linked; text typed after it is plain')
  assert.equal(getMentionLinkState(view.state).visible, false)
})
