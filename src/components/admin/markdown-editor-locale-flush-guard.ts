/**
 * Pure decision logic behind `MarkdownEditorField`'s editor remount `key`
 * (Red Team F8 — see phase-09 of the Lark editor stabilization plan).
 *
 * `MilkdownEditorCore` is an UNCONTROLLED component: it reads `markdown`
 * only once at mount time (`initialMarkdownRef` in `milkdown-editor-core.tsx`)
 * and pushes edits upstream via `onChange`, which Milkdown's own
 * `markdownUpdated` listener DEBOUNCES ~200ms before firing (see
 * `@milkdown/plugin-listener`'s `debounce(fn, 200)` — verified directly
 * against the installed package; there is no `maxWait`, so the trailing
 * timer restarts on every keystroke and is unconditionally `.cancel()`led
 * on editor `destroy()`, never flushed). Two hazards follow:
 *
 * 1. Locale switch mid-edit: `MarkdownEditorField` previously remounted the
 *    editor immediately via `key={locale}` on every locale change. If the
 *    user's last keystroke was still inside that 200ms debounce window,
 *    the remount destroys the editor before the debounce fires, so the
 *    pending `onChange` never runs and the last keystrokes are lost for
 *    the OUTGOING locale.
 * 2. External mutation while mounted: something other than this editor's
 *    own `onChange` can change the field's `value` (e.g. restoring an
 *    older Payload version while the field stays mounted, same locale).
 *    An uncontrolled editor never re-reads `value` after mount, so it
 *    would silently keep its stale buffer and clobber the restored value
 *    on its next edit.
 *
 * The fix: delay the locale-driven remount past Milkdown's debounce
 * window, and detect same-locale external value changes to force a
 * resync remount instead of drifting silently. This module is the pure
 * reducer behind that fix — no React, no timers, fully unit-testable
 * (mirrors the `transitionSelectionPhase` pattern in
 * `milkdown-lark-selection-plugin.ts`).
 *
 * 3. Cross-locale corruption during the flush-delay window itself: Payload
 *    swaps the field's `value` for the new locale ASYNCHRONOUSLY, at some
 *    point after the locale switch starts — the exact timing relative to
 *    this reducer's 250ms flush window is not controlled by us. The
 *    outgoing (pre-switch) editor instance stays mounted for that whole
 *    window and may still emit a trailing debounced `onChange`. If
 *    Payload's swap lands BEFORE that trailing write arrives, blindly
 *    calling `setValue()` would overwrite the NEW locale's freshly loaded
 *    value with the OLD locale's stale buffer — silent cross-locale data
 *    corruption, strictly worse than hazard #1's bounded keystroke loss.
 *    `shouldAllowPendingLocaleWrite` below is the defensive gate: it only
 *    allows a write while pending if the field's current value still
 *    matches the value captured at the moment the window armed (i.e. the
 *    swap provably hasn't landed yet). Once they diverge, the write is
 *    dropped — degrading to hazard #1's already-accepted trailing-
 *    keystroke loss instead of corrupting the new locale's content.
 *    Empirical browser-timing verification of exactly when Payload's
 *    locale refetch swaps `value` remains a follow-up; this gate is
 *    deliberately conservative (drop-on-any-mismatch) so it fails safe
 *    regardless of that timing.
 */

/** Margin above Milkdown's 200ms `markdownUpdated` debounce window. */
export const LOCALE_SWITCH_FLUSH_DELAY_MS = 250

export type FlushGuardState = {
  /** The locale the mounted `MilkdownEditorCore` instance is keyed to. */
  activeLocaleCode: string
  /** Bumped on every detected external mutation, forcing a resync remount. */
  externalVersion: number
  /** The last value this editor is known to have produced or synced to. */
  lastEmittedValue: string
  /** Non-null while a locale switch is waiting out the flush delay. */
  pendingLocaleCode: string | null
  /**
   * The field's value at the moment the CURRENT pending window armed
   * (null when not pending). `shouldAllowPendingLocaleWrite` compares this
   * against the field's live value to detect whether Payload's async
   * locale swap has already landed.
   */
  pendingPreSwitchValue: string | null
}

export type FlushGuardEvent =
  /** `useLocale()` reports a (possibly unchanged) locale code. */
  | { type: 'locale-change'; localeCode: string }
  /** The flush-delay timer armed for `localeCode` has elapsed. */
  | { type: 'locale-flush-elapsed'; latestValue: string; localeCode: string }
  /** The field's `value` prop changed to something not yet accounted for. */
  | { type: 'value-changed'; value: string }
  /** This editor's own `onChange` fired. */
  | { type: 'value-emitted'; value: string }

export function createInitialFlushGuardState(localeCode: string, value: string): FlushGuardState {
  return {
    activeLocaleCode: localeCode,
    externalVersion: 0,
    lastEmittedValue: value,
    pendingLocaleCode: null,
    pendingPreSwitchValue: null,
  }
}

export function reduceFlushGuardState(
  state: FlushGuardState,
  event: FlushGuardEvent,
): FlushGuardState {
  switch (event.type) {
    case 'locale-change': {
      if (event.localeCode === state.activeLocaleCode) {
        return state.pendingLocaleCode === null
          ? state
          : { ...state, pendingLocaleCode: null, pendingPreSwitchValue: null }
      }
      if (event.localeCode === state.pendingLocaleCode) return state
      return {
        ...state,
        pendingLocaleCode: event.localeCode,
        // Capture the pre-switch value ONLY on the initial arm (transition
        // from "not pending" to pending). A second switch while already
        // pending (e.g. vi -> en -> fr before en's timer fires) must NOT
        // recapture: Payload may already be mid-swap toward `en` by then,
        // and the guard needs to keep comparing against the ORIGINAL
        // (outgoing-locale) value for the whole window, not an intermediate
        // target that was itself superseded before it ever became active.
        pendingPreSwitchValue:
          state.pendingLocaleCode === null ? state.lastEmittedValue : state.pendingPreSwitchValue,
      }
    }

    case 'locale-flush-elapsed': {
      // A superseded timer from an earlier (now stale) locale switch —
      // e.g. the user flipped vi -> en -> vi before the first timer fired.
      // Ignore it; the latest 'locale-change' owns the current pending target.
      if (event.localeCode !== state.pendingLocaleCode) return state
      return {
        ...state,
        activeLocaleCode: event.localeCode,
        lastEmittedValue: event.latestValue,
        pendingLocaleCode: null,
        pendingPreSwitchValue: null,
      }
    }

    case 'value-changed': {
      // Mid locale-transition: the pending switch already owns resyncing
      // the editor once it flushes, so a same-tick value change here (the
      // admin loading the new locale's stored value) must not be mistaken
      // for an external mutation and must not trigger an early remount.
      if (state.pendingLocaleCode !== null) return state
      if (event.value === state.lastEmittedValue) return state
      return {
        ...state,
        externalVersion: state.externalVersion + 1,
        lastEmittedValue: event.value,
      }
    }

    case 'value-emitted': {
      if (event.value === state.lastEmittedValue) return state
      return { ...state, lastEmittedValue: event.value }
    }

    default:
      return state
  }
}

/** The `key` prop to give `MilkdownEditorCore` so it remounts exactly when this reducer intends. */
export function flushGuardRemountKey(state: FlushGuardState): string {
  return `${state.activeLocaleCode}::${state.externalVersion}`
}

/**
 * Gate for whether a `setValue()` write from this editor's own `onChange`
 * (i.e. a `value-emitted` event) should actually be applied to Payload's
 * field state right now.
 *
 * Invariant: while a locale switch is pending, the outgoing editor
 * instance may still emit a trailing debounced write. Applying it
 * unconditionally is only safe if Payload's async locale swap hasn't
 * landed yet, which we detect by checking whether the field's live value
 * is still the value captured at the moment the pending window armed. If
 * it differs, the swap has already happened and applying the write would
 * silently overwrite the NEW locale's content with the OLD locale's stale
 * buffer — so the write must be dropped instead (see hazard #3 in the
 * module doc comment above). Not pending → always allow (steady-state
 * typing is unaffected).
 *
 * Caveat: this assumes a real locale switch changes the field's stored
 * value away from `pendingPreSwitchValue`. If both locales happen to hold
 * identical content, a landed swap would look indistinguishable from "not
 * landed yet" and the write would be (harmlessly, since the values match)
 * allowed. Empirical verification of Payload's locale-swap timing remains
 * a follow-up (see the review finding this fixes).
 */
export function shouldAllowPendingLocaleWrite(
  state: FlushGuardState,
  currentFieldValue: string,
): boolean {
  if (state.pendingLocaleCode === null) return true
  return currentFieldValue === state.pendingPreSwitchValue
}
