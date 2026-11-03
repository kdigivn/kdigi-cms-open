import assert from 'node:assert/strict'
import test from 'node:test'

import { BodyScrollLockController } from './use-body-scroll-lock'
import type { BodyScrollLockAdapter } from './use-body-scroll-lock'

/**
 * Fake adapter recording every DOM-facing call `BodyScrollLockController`
 * makes, so the refcount/snapshot/restore logic can be asserted without a
 * real browser DOM (jsdom-free, matching this repo's plain `node:test`
 * setup — see `package.json`'s `test` script).
 */
function createFakeAdapter(options: {
  bodyStyle?: Record<string, string>
  scrollX?: number
  scrollY?: number
  scrollbarWidth?: number
} = {}): BodyScrollLockAdapter & {
  scrollToCalls: { x: number; y: number }[]
  styleHistory: { property: string; value: string }[]
} {
  const bodyStyle: Record<string, string> = { ...options.bodyStyle }
  const scrollToCalls: { x: number; y: number }[] = []
  const styleHistory: { property: string; value: string }[] = []

  return {
    getBodyInlineStyle: (property) => bodyStyle[property] ?? '',
    setBodyInlineStyle: (property, value) => {
      styleHistory.push({ property, value })
      bodyStyle[property] = value
    },
    getScrollbarWidth: () => options.scrollbarWidth ?? 0,
    getScrollPosition: () => ({ x: options.scrollX ?? 0, y: options.scrollY ?? 0 }),
    scrollTo: (x, y) => {
      scrollToCalls.push({ x, y })
    },
    scrollToCalls,
    styleHistory,
  }
}

test('lock() snapshots the current body inline styles before mutating them', () => {
  const adapter = createFakeAdapter({
    bodyStyle: { overflow: 'visible', position: 'static' },
    scrollX: 12,
    scrollY: 340,
  })
  const controller = new BodyScrollLockController(adapter)

  controller.lock()

  assert.equal(adapter.getBodyInlineStyle('overflow'), 'hidden')
  assert.equal(adapter.getBodyInlineStyle('position'), 'fixed')
  assert.equal(adapter.getBodyInlineStyle('top'), '-340px')
  assert.equal(adapter.getBodyInlineStyle('left'), '-12px')
  assert.equal(adapter.getBodyInlineStyle('width'), '100%')
  assert.equal(controller.activeLockCount, 1)
  assert.equal(controller.isLocked, true)
})

test('unlock() restores the exact pre-lock snapshot, including scroll position', () => {
  const adapter = createFakeAdapter({
    bodyStyle: { overflow: 'visible', position: 'static', top: '', left: '', width: '' },
    scrollX: 5,
    scrollY: 800,
  })
  const controller = new BodyScrollLockController(adapter)

  controller.lock()
  controller.unlock()

  assert.equal(adapter.getBodyInlineStyle('overflow'), 'visible')
  assert.equal(adapter.getBodyInlineStyle('position'), 'static')
  assert.equal(adapter.getBodyInlineStyle('top'), '')
  assert.equal(adapter.getBodyInlineStyle('left'), '')
  assert.equal(adapter.getBodyInlineStyle('width'), '')
  assert.deepEqual(adapter.scrollToCalls, [{ x: 5, y: 800 }])
  assert.equal(controller.activeLockCount, 0)
  assert.equal(controller.isLocked, false)
})

test('scrollbar-width compensation is added on top of any existing padding-right', () => {
  const adapter = createFakeAdapter({
    bodyStyle: { 'padding-right': '8px' },
    scrollbarWidth: 15,
  })
  const controller = new BodyScrollLockController(adapter)

  controller.lock()

  assert.equal(adapter.getBodyInlineStyle('padding-right'), '23px')

  controller.unlock()

  assert.equal(adapter.getBodyInlineStyle('padding-right'), '8px')
})

test('does not add padding-right compensation when there is no scrollbar', () => {
  const adapter = createFakeAdapter({ scrollbarWidth: 0 })
  const controller = new BodyScrollLockController(adapter)

  controller.lock()

  const paddingWrites = adapter.styleHistory.filter((entry) => entry.property === 'padding-right')
  assert.deepEqual(paddingWrites, [])
})

test('refcounts nested locks: only the first lock snapshots/mutates and only the last unlock restores', () => {
  const adapter = createFakeAdapter({ bodyStyle: { overflow: 'visible' } })
  const controller = new BodyScrollLockController(adapter)

  // Simulates Focus mode locking first, then the Shortcuts sheet opening on
  // top of it (both overlays call lock()/unlock() independently).
  controller.lock() // focus mode
  controller.lock() // shortcuts sheet
  assert.equal(controller.activeLockCount, 2)

  const overflowWritesAfterBothLocks = adapter.styleHistory.filter(
    (entry) => entry.property === 'overflow',
  )
  assert.equal(overflowWritesAfterBothLocks.length, 1, 'second lock() must not re-apply styles')

  controller.unlock() // shortcuts sheet closes first
  assert.equal(controller.isLocked, true, 'focus mode still holds the lock')
  assert.equal(adapter.getBodyInlineStyle('overflow'), 'hidden', 'page must stay locked')

  controller.unlock() // focus mode exits last
  assert.equal(controller.isLocked, false)
  assert.equal(adapter.getBodyInlineStyle('overflow'), 'visible', 'original style restored')
})

test('unlock() without a matching lock() is a safe no-op (unmount/error-path safety)', () => {
  const adapter = createFakeAdapter({ bodyStyle: { overflow: 'visible' } })
  const controller = new BodyScrollLockController(adapter)

  assert.doesNotThrow(() => controller.unlock())
  assert.equal(controller.activeLockCount, 0)
  assert.deepEqual(adapter.scrollToCalls, [])
  assert.equal(adapter.getBodyInlineStyle('overflow'), 'visible')
})

test('a fresh lock/unlock cycle after a full close re-snapshots the current styles', () => {
  const adapter = createFakeAdapter({ bodyStyle: { overflow: 'visible' }, scrollY: 100 })
  const controller = new BodyScrollLockController(adapter)

  controller.lock()
  controller.unlock()

  // Page state changed between the two overlay openings (e.g. the user
  // scrolled further down while the panel was closed).
  adapter.getScrollPosition = () => ({ x: 0, y: 999 })

  controller.lock()
  assert.equal(adapter.getBodyInlineStyle('top'), '-999px')

  controller.unlock()
  assert.deepEqual(adapter.scrollToCalls.at(-1), { x: 0, y: 999 })
})
