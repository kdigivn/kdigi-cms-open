import assert from 'node:assert/strict'
import test from 'node:test'

import { planBlockMove, type BlockTarget } from './milkdown-lark-commands'

/**
 * `planBlockMove` is the arithmetic half of the block-move commands (phase 6, SP2-3):
 * positions in a ProseMirror document shift as soon as you delete, which is the part that
 * silently corrupts a document when it is wrong. The command functions themselves are
 * thin ProseMirror glue around this and are covered by the matrix rows
 * `move-block-up` / `move-block-down`.
 */

/** `{from, to, previousSize, nextSize}` for a parent whose children have these sizes. */
function targetIn(children: number[], index: number): BlockTarget {
  const from = children.slice(0, index).reduce((sum, size) => sum + size, 0)
  return {
    from,
    to: from + children[index],
    previousSize: index > 0 ? children[index - 1] : null,
    nextSize: index < children.length - 1 ? children[index + 1] : null,
  }
}

/** Applies a plan to a copy of the children array — the observable "did it swap?" check. */
function applyMove(children: number[], index: number, direction: 'up' | 'down'): number[] {
  const target = targetIn(children, index)
  const plan = planBlockMove(target, direction)
  if (!plan) return [...children]
  const moved = children[index]
  const before = children.slice(0, index).concat(children.slice(index + 1))
  // Walk the post-delete layout to translate `insertAt` (a document position) back into an
  // array index: positions count child SIZES, and every child here is a block.
  let position = 0
  let insertIndex = before.length
  for (let i = 0; i < before.length; i += 1) {
    if (position === plan.insertAt) {
      insertIndex = i
      break
    }
    position += before[i]
  }
  return [...before.slice(0, insertIndex), moved, ...before.slice(insertIndex)]
}

test('planBlockMove: moving the second of three blocks up puts it first', () => {
  assert.deepEqual(applyMove([10, 4, 7], 1, 'up'), [4, 10, 7])
})

test('planBlockMove: moving the second of three blocks down puts it last', () => {
  assert.deepEqual(applyMove([10, 4, 7], 1, 'down'), [10, 7, 4])
})

test('planBlockMove: moving the last block up swaps exactly two neighbours', () => {
  assert.deepEqual(applyMove([10, 4, 7], 2, 'up'), [10, 7, 4])
})

test('planBlockMove: moving the first block down swaps exactly two neighbours', () => {
  assert.deepEqual(applyMove([10, 4, 7], 0, 'down'), [4, 10, 7])
})

test('planBlockMove: the first block cannot move up', () => {
  assert.equal(planBlockMove(targetIn([10, 4, 7], 0), 'up'), null)
})

test('planBlockMove: the last block cannot move down', () => {
  assert.equal(planBlockMove(targetIn([10, 4, 7], 2), 'down'), null)
})

test('planBlockMove: a single block cannot move in either direction', () => {
  assert.equal(planBlockMove(targetIn([5], 0), 'up'), null)
  assert.equal(planBlockMove(targetIn([5], 0), 'down'), null)
})

test('planBlockMove: the delete range is always exactly the moved block', () => {
  const target = targetIn([10, 4, 7], 1)
  for (const direction of ['up', 'down'] as const) {
    const plan = planBlockMove(target, direction)
    assert.ok(plan)
    assert.deepEqual([plan.deleteFrom, plan.deleteTo], [target.from, target.to])
  }
})

test('planBlockMove: a down-move inserts after the next sibling, never past the parent', () => {
  const target = targetIn([10, 4, 7], 0)
  const nextSize = target.nextSize
  assert.notEqual(nextSize, null, 'the fixture must have a next sibling')
  const plan = planBlockMove(target, 'down')
  assert.ok(plan)
  // Last-but-one child: the insertion point must be the position where the moved block
  // previously ended, i.e. inside the parent — a larger value would append it to the root.
  assert.equal(plan.insertAt, target.from + (nextSize ?? 0))
})
