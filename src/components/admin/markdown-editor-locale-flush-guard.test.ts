import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialFlushGuardState,
  flushGuardRemountKey,
  reduceFlushGuardState,
  shouldAllowPendingLocaleWrite,
} from './markdown-editor-locale-flush-guard.js'

// --- Locale switch mid-edit: remount waits for the flush delay -------------

test('locale-change alone does not remount immediately — it only arms a pending switch', () => {
  const initial = createInitialFlushGuardState('vi', 'nội dung')
  const next = reduceFlushGuardState(initial, { type: 'locale-change', localeCode: 'en' })

  assert.equal(next.activeLocaleCode, 'vi', 'still keyed to the outgoing locale')
  assert.equal(next.pendingLocaleCode, 'en')
  assert.equal(flushGuardRemountKey(next), flushGuardRemountKey(initial), 'remount key unchanged yet')
})

test('locale-flush-elapsed for the pending locale swaps activeLocaleCode and captures the latest value', () => {
  const afterSwitch = reduceFlushGuardState(createInitialFlushGuardState('vi', 'draft vi'), {
    type: 'locale-change',
    localeCode: 'en',
  })

  const flushed = reduceFlushGuardState(afterSwitch, {
    type: 'locale-flush-elapsed',
    latestValue: 'draft vi final keystrokes',
    localeCode: 'en',
  })

  assert.equal(flushed.activeLocaleCode, 'en')
  assert.equal(flushed.pendingLocaleCode, null)
  assert.equal(flushed.lastEmittedValue, 'draft vi final keystrokes')
  assert.notEqual(flushGuardRemountKey(flushed), flushGuardRemountKey(afterSwitch))
})

test('a stale locale-flush-elapsed (superseded by a later switch to a third locale) is ignored', () => {
  // vi -> en (timer A armed for 'en') -> fr (timer B armed for 'fr') before
  // timer A fires. Timer A must not resurrect 'en' as active.
  let state = createInitialFlushGuardState('vi', 'v1')
  state = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'en' })
  state = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'fr' })
  assert.equal(state.pendingLocaleCode, 'fr', 'the later switch to fr supersedes the pending en target')

  const staleFlush = reduceFlushGuardState(state, {
    type: 'locale-flush-elapsed',
    latestValue: 'v1 stale',
    localeCode: 'en',
  })

  assert.equal(staleFlush, state, 'stale event for the superseded target locale is a no-op')
})

test('switching back to the still-mounted active locale cancels the pending switch immediately (no flush wait needed)', () => {
  // The editor never actually remounted (activeLocaleCode is still 'vi'),
  // so flipping back to 'vi' before the 'en' timer fires needs no flush
  // delay of its own — cancel the pending switch outright.
  const state = reduceFlushGuardState(createInitialFlushGuardState('vi', 'v1'), {
    type: 'locale-change',
    localeCode: 'en',
  })
  assert.equal(state.pendingLocaleCode, 'en')

  const backToVi = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'vi' })
  assert.equal(backToVi.pendingLocaleCode, null)
  assert.equal(backToVi.activeLocaleCode, 'vi')
})

// --- External mutation while mounted (e.g. version restore) ---------------

test('an external value change while steady (no pending locale switch) forces a resync remount', () => {
  const initial = createInitialFlushGuardState('vi', 'current buffer')
  const restored = reduceFlushGuardState(initial, {
    type: 'value-changed',
    value: 'restored from an older version',
  })

  assert.equal(restored.lastEmittedValue, 'restored from an older version')
  assert.equal(restored.externalVersion, initial.externalVersion + 1)
  assert.notEqual(flushGuardRemountKey(restored), flushGuardRemountKey(initial))
})

test('a value-changed event matching the last emitted value is a no-op (no spurious remount)', () => {
  const initial = createInitialFlushGuardState('vi', 'same value')
  const result = reduceFlushGuardState(initial, { type: 'value-changed', value: 'same value' })
  assert.equal(result, initial)
})

test('value-changed during a pending locale transition is ignored — the switch owns resyncing', () => {
  const pending = reduceFlushGuardState(createInitialFlushGuardState('vi', 'vi content'), {
    type: 'locale-change',
    localeCode: 'en',
  })

  // Admin loads the target locale's stored value while the old instance is
  // still mounted, waiting out the flush delay — must NOT bump externalVersion.
  const duringTransition = reduceFlushGuardState(pending, {
    type: 'value-changed',
    value: 'en content from the server',
  })

  assert.equal(duringTransition.externalVersion, pending.externalVersion)
  assert.equal(duringTransition.pendingLocaleCode, 'en')
})

test("this editor's own onChange never triggers a remount, only updates the tracked value", () => {
  const initial = createInitialFlushGuardState('vi', 'v1')
  const afterEdit = reduceFlushGuardState(initial, { type: 'value-emitted', value: 'v2' })

  assert.equal(afterEdit.lastEmittedValue, 'v2')
  assert.equal(afterEdit.externalVersion, initial.externalVersion)
  assert.equal(flushGuardRemountKey(afterEdit), flushGuardRemountKey(initial))
})

test('own onChange immediately followed by the matching value-changed effect does not double-count as external', () => {
  // Simulates: handleChange('v2') dispatches value-emitted synchronously,
  // then the value-changed effect fires on the next render with the same 'v2'.
  let state = createInitialFlushGuardState('vi', 'v1')
  state = reduceFlushGuardState(state, { type: 'value-emitted', value: 'v2' })
  const afterEffect = reduceFlushGuardState(state, { type: 'value-changed', value: 'v2' })

  assert.equal(afterEffect.externalVersion, 0, 'no remount for a change this editor itself produced')
})

// --- End-to-end scenario mirroring the F8 race ------------------------------

test('end-to-end: typing, then an immediate locale switch, flushes the pending edit before remounting', () => {
  let state = createInitialFlushGuardState('vi', 'Xin chào')

  // User types more; onChange has not fired yet (still inside Milkdown's
  // 200ms debounce) — no event reaches the reducer for that keystroke yet.

  // User switches locale mid-debounce.
  state = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'en' })
  assert.equal(state.activeLocaleCode, 'vi', 'old instance stays mounted during the flush delay')

  // Milkdown's debounce finally fires (this reducer's caller reads the
  // latest buffered value at that moment, e.g. via a ref).
  state = reduceFlushGuardState(state, {
    type: 'locale-flush-elapsed',
    latestValue: 'Xin chào các bạn',
    localeCode: 'en',
  })

  assert.equal(state.activeLocaleCode, 'en', 'now safe to remount into the new locale')
  assert.equal(state.lastEmittedValue, 'Xin chào các bạn', 'trailing keystrokes were captured, not lost')
})

// --- Cross-locale corruption gate: shouldAllowPendingLocaleWrite ----------

test('steady state (no pending locale switch) always allows the write', () => {
  const state = createInitialFlushGuardState('vi', 'vi content')
  assert.equal(shouldAllowPendingLocaleWrite(state, 'vi content'), true)
  assert.equal(shouldAllowPendingLocaleWrite(state, 'vi content edited'), true)
})

test("swap-lands-before-flush: Payload's locale swap beats the trailing write — write is dropped", () => {
  // vi -> en armed; pendingPreSwitchValue captures the vi content at that
  // instant. Before the outgoing vi editor's trailing debounce fires,
  // Payload's async locale swap lands and the field's live value becomes
  // the stored 'en' content.
  const pending = reduceFlushGuardState(createInitialFlushGuardState('vi', 'vi draft'), {
    type: 'locale-change',
    localeCode: 'en',
  })
  assert.equal(pending.pendingPreSwitchValue, 'vi draft')

  const swappedLiveValue = 'en stored content'
  assert.equal(
    shouldAllowPendingLocaleWrite(pending, swappedLiveValue),
    false,
    'live value diverged from the captured pre-switch value — swap already landed, drop the write',
  )
})

test('flush-before-swap: the trailing write lands while the field still holds the pre-switch value — allowed', () => {
  const pending = reduceFlushGuardState(createInitialFlushGuardState('vi', 'vi draft'), {
    type: 'locale-change',
    localeCode: 'en',
  })

  assert.equal(
    shouldAllowPendingLocaleWrite(pending, 'vi draft'),
    true,
    "Payload hasn't swapped yet (live value still matches the captured pre-switch value) — safe to write",
  )
})

test('double locale switch inside the window keeps the ORIGINAL pre-switch value, not the intermediate target', () => {
  // vi -> en (captures 'vi draft') -> fr, before en's timer ever fires.
  let state = createInitialFlushGuardState('vi', 'vi draft')
  state = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'en' })
  state = reduceFlushGuardState(state, { type: 'locale-change', localeCode: 'fr' })

  assert.equal(state.pendingLocaleCode, 'fr')
  assert.equal(
    state.pendingPreSwitchValue,
    'vi draft',
    'the second switch must not recapture — it would clobber the value the window is actually guarding against',
  )
  assert.equal(shouldAllowPendingLocaleWrite(state, 'vi draft'), true)
  assert.equal(shouldAllowPendingLocaleWrite(state, 'fr stored content'), false)
})

test('value-emitted during the pending window updates lastEmittedValue once the gate allows the write', () => {
  const pending = reduceFlushGuardState(createInitialFlushGuardState('vi', 'vi draft'), {
    type: 'locale-change',
    localeCode: 'en',
  })

  // Caller checks the gate first (mirrors handleChange in
  // markdown-editor-field.tsx); the write is allowed because the live
  // value still matches the captured pre-switch value.
  assert.equal(shouldAllowPendingLocaleWrite(pending, 'vi draft'), true)
  const afterEmit = reduceFlushGuardState(pending, {
    type: 'value-emitted',
    value: 'vi draft + trailing keystrokes',
  })

  assert.equal(afterEmit.lastEmittedValue, 'vi draft + trailing keystrokes')
  assert.equal(afterEmit.pendingLocaleCode, 'en', 'still pending — the flush timer owns the eventual remount')
})

test('an external value change (version restore) while NOT pending is unaffected by the gate and still forces a resync', () => {
  const initial = createInitialFlushGuardState('vi', 'current buffer')
  assert.equal(shouldAllowPendingLocaleWrite(initial, 'current buffer'), true, 'gate is a no-op outside a pending window')

  const restored = reduceFlushGuardState(initial, {
    type: 'value-changed',
    value: 'restored from an older version',
  })
  assert.equal(restored.externalVersion, initial.externalVersion + 1)
  assert.equal(restored.pendingPreSwitchValue, null, 'no pending window involved')
})
