'use client'

import type { DecorationAttrs, ProseMirrorNode } from './milkdown-vendor'
import {
  $prose,
  Decoration,
  DecorationSet,
  EditorView,
  Plugin,
  PluginKey,
  TextSelection,
} from './milkdown-vendor'

type MatchRange = { from: number; to: number }
type SourceRange = MatchRange | null
type DecoratedMatch = MatchRange & { relativeIndex?: number }

type FindReplaceState = {
  activeIndex: number
  caseSensitive: boolean
  matches: MatchRange[]
  query: string
}

type FindReplaceAction =
  | { type: 'close' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'recompute' }
  | { type: 'set-query'; caseSensitive: boolean; query: string }

const FIND_RECOMPUTE_DEBOUNCE_MS = 150
const MAX_DECORATED_MATCHES = 500

const emptyState: FindReplaceState = {
  activeIndex: 0,
  caseSensitive: false,
  matches: [],
  query: '',
}

export const milkdownFindReplacePluginKey = new PluginKey<FindReplaceState>(
  'MILKDOWN_FIND_REPLACE',
)

function normalizeText(value: string, caseSensitive: boolean) {
  const normalized = value.normalize('NFC')
  return caseSensitive ? normalized : normalized.toLocaleLowerCase()
}

function isCombiningMark(value: string) {
  return /\p{M}/u.test(value)
}

function appendNormalizedText(
  result: { ranges: SourceRange[]; text: string },
  value: string,
  basePos: number,
  caseSensitive: boolean,
) {
  let cluster = ''
  let clusterStart = 0
  let offset = 0

  const flushCluster = (clusterEnd: number) => {
    if (!cluster) return

    const normalizedCluster = normalizeText(cluster, caseSensitive)
    if (!normalizedCluster) {
      cluster = ''
      return
    }

    const range = {
      from: basePos + clusterStart,
      to: basePos + clusterEnd,
    }

    result.text += normalizedCluster
    for (let index = 0; index < normalizedCluster.length; index += 1) {
      result.ranges.push(range)
    }

    cluster = ''
  }

  for (const symbol of Array.from(value)) {
    if (!cluster) {
      cluster = symbol
      clusterStart = offset
      offset += symbol.length
      continue
    }

    if (isCombiningMark(symbol)) {
      cluster += symbol
      offset += symbol.length
      continue
    }

    flushCluster(offset)
    cluster = symbol
    clusterStart = offset
    offset += symbol.length
  }

  flushCluster(offset)
}

function buildTextIndex(doc: ProseMirrorNode, caseSensitive: boolean) {
  const result = { ranges: [] as SourceRange[], text: '' }
  let hasTextBlock = false

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.name === 'code_block') return false

    if (hasTextBlock) {
      result.text += '\n'
      result.ranges.push(null)
    }
    hasTextBlock = true

    node.forEach((child, offset) => {
      const childPos = pos + offset + 1

      if (child.isText && child.text) {
        appendNormalizedText(result, child.text, childPos, caseSensitive)
        return
      }

      if (child.type.name === 'hard_break') {
        result.text += '\n'
        result.ranges.push({
          from: childPos,
          to: childPos + child.nodeSize,
        })
      }
    })

    return false
  })

  return result
}

function getMatchRange(
  ranges: SourceRange[],
  start: number,
  end: number,
): MatchRange | null {
  const slice = ranges.slice(start, end)
  if (slice.length === 0 || slice.some((range) => range == null)) return null

  const firstRange = slice[0]
  const lastRange = slice.at(-1)
  if (!firstRange || !lastRange) return null

  return {
    from: firstRange.from,
    to: lastRange.to,
  }
}

function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): MatchRange[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const normalizedQuery = normalizeText(trimmed, caseSensitive)
  if (!normalizedQuery) return []

  const { ranges, text } = buildTextIndex(doc, caseSensitive)
  const matches: MatchRange[] = []
  let cursor = 0

  while (cursor < text.length) {
    const index = text.indexOf(normalizedQuery, cursor)
    if (index === -1) break

    const match = getMatchRange(ranges, index, index + normalizedQuery.length)
    if (match) matches.push(match)

    cursor = index + normalizedQuery.length
  }

  return matches
}

function nextIndex(current: number, size: number, delta: 1 | -1) {
  if (size === 0) return 0
  return (current + delta + size) % size
}

function limitDecoratedMatches(matches: MatchRange[], activeIndex: number): DecoratedMatch[] {
  if (matches.length <= MAX_DECORATED_MATCHES) {
    return matches
  }

  const lastWindowStart = matches.length - MAX_DECORATED_MATCHES
  const windowStart = Math.max(
    0,
    Math.min(activeIndex - Math.floor(MAX_DECORATED_MATCHES / 2), lastWindowStart),
  )

  return matches
    .slice(windowStart, windowStart + MAX_DECORATED_MATCHES)
    .map((match, index) => ({
      ...match,
      relativeIndex: windowStart + index,
    }))
}

function createDecorations(doc: ProseMirrorNode, state: FindReplaceState) {
  const decorations = limitDecoratedMatches(state.matches, state.activeIndex).map(
    (match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          (match.relativeIndex ?? index) === state.activeIndex
            ? 'milkdown-find-match milkdown-find-match--active'
            : 'milkdown-find-match',
      } satisfies DecorationAttrs),
  )

  return DecorationSet.create(doc, decorations)
}

function computeState(
  doc: ProseMirrorNode,
  previous: FindReplaceState,
  next: Partial<FindReplaceState>,
): FindReplaceState {
  const state = { ...previous, ...next }
  const matches = findMatches(doc, state.query, state.caseSensitive)
  return {
    ...state,
    matches,
    activeIndex: matches.length
      ? Math.max(0, Math.min(state.activeIndex, matches.length - 1))
      : 0,
  }
}

function createRecomputeAction(): FindReplaceAction {
  return { type: 'recompute' }
}

export const milkdownFindReplacePlugin = $prose(
  () =>
    new Plugin<FindReplaceState>({
      key: milkdownFindReplacePluginKey,
      state: {
        init: (_, state) => computeState(state.doc, emptyState, {}),
        apply(tr, previous, _oldState, newState) {
          const meta = tr.getMeta(milkdownFindReplacePluginKey) as
            | FindReplaceAction
            | undefined

          if (meta?.type === 'close') return emptyState
          if (meta?.type === 'next') {
            return {
              ...previous,
              activeIndex: nextIndex(previous.activeIndex, previous.matches.length, 1),
            }
          }
          if (meta?.type === 'prev') {
            return {
              ...previous,
              activeIndex: nextIndex(previous.activeIndex, previous.matches.length, -1),
            }
          }
          if (meta?.type === 'recompute') {
            return computeState(newState.doc, previous, {})
          }
          if (meta?.type === 'set-query') {
            return computeState(newState.doc, previous, {
              activeIndex: 0,
              caseSensitive: meta.caseSensitive,
              query: meta.query,
            })
          }
          // Doc changed with no explicit action (typing while the panel is
          // open): the debounced recompute fires later, but decorations are
          // rebuilt from plugin state on EVERY render — stale positions can
          // exceed the new doc size and crash DecorationSet.create. Map the
          // stored ranges through the transaction so they stay valid (and
          // visually track their text) until the recompute lands.
          if (tr.docChanged && previous.matches.length > 0) {
            const maxPos = newState.doc.content.size
            const matches = previous.matches
              .map((match) => ({
                from: Math.min(tr.mapping.map(match.from, 1), maxPos),
                to: Math.min(tr.mapping.map(match.to, -1), maxPos),
              }))
              .filter((match) => match.from < match.to)
            return {
              ...previous,
              matches,
              activeIndex: matches.length
                ? Math.min(previous.activeIndex, matches.length - 1)
                : 0,
            }
          }
          return previous
        },
      },
      props: {
        decorations(state) {
          return createDecorations(
            state.doc,
            milkdownFindReplacePluginKey.getState(state) ?? emptyState,
          )
        },
      },
      view(view) {
        let recomputeTimeout: number | null = null

        const clearRecomputeTimeout = () => {
          if (recomputeTimeout == null) return
          window.clearTimeout(recomputeTimeout)
          recomputeTimeout = null
        }

        const scheduleRecompute = () => {
          clearRecomputeTimeout()
          recomputeTimeout = window.setTimeout(() => {
            recomputeTimeout = null

            const pluginState =
              milkdownFindReplacePluginKey.getState(view.state) ?? emptyState
            if (!pluginState.query.trim()) return

            view.dispatch(
              view.state.tr.setMeta(
                milkdownFindReplacePluginKey,
                createRecomputeAction(),
              ),
            )
          }, FIND_RECOMPUTE_DEBOUNCE_MS)
        }

        return {
          update(nextView, previousState) {
            const previousPluginState =
              milkdownFindReplacePluginKey.getState(previousState) ?? emptyState
            const nextPluginState =
              milkdownFindReplacePluginKey.getState(nextView.state) ?? emptyState

            if (
              previousPluginState.query !== nextPluginState.query
              || previousPluginState.caseSensitive !== nextPluginState.caseSensitive
            ) {
              clearRecomputeTimeout()
            }

            if (nextView.state.doc !== previousState.doc && nextPluginState.query.trim()) {
              scheduleRecompute()
            }
          },
          destroy() {
            clearRecomputeTimeout()
          },
        }
      },
    }),
)

export function getFindReplaceState(view: EditorView) {
  return milkdownFindReplacePluginKey.getState(view.state) ?? emptyState
}

export function dispatchFindReplaceAction(view: EditorView, action: FindReplaceAction) {
  view.dispatch(view.state.tr.setMeta(milkdownFindReplacePluginKey, action))
}

export function focusActiveFindMatch(view: EditorView) {
  const state = getFindReplaceState(view)
  const activeMatch = state.matches[state.activeIndex]
  if (!activeMatch) return

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, activeMatch.from, activeMatch.to))
      .scrollIntoView(),
  )
}

export function replaceCurrentFindMatch(view: EditorView, replacement: string) {
  const state = getFindReplaceState(view)
  const activeMatch = state.matches[state.activeIndex]
  if (!activeMatch) return

  const tr = view.state.tr
    .insertText(replacement, activeMatch.from, activeMatch.to)
    .setMeta(milkdownFindReplacePluginKey, createRecomputeAction())

  view.dispatch(tr)
}

export function replaceAllFindMatches(view: EditorView, replacement: string) {
  const state = getFindReplaceState(view)
  if (state.matches.length === 0) return

  const tr = state.matches
    .slice()
    .reverse()
    .reduce(
      (accumulator, match) =>
        accumulator.insertText(replacement, match.from, match.to),
      view.state.tr,
    )
    .setMeta(milkdownFindReplacePluginKey, createRecomputeAction())

  view.dispatch(tr)
}
