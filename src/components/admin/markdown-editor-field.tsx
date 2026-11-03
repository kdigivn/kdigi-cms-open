'use client'
/**
 * Payload admin field component — Markdown editor powered by Milkdown Crepe.
 * Registered as the Field component for `{name}Md` text fields via markdownHtmlField().
 *
 * Stores plain CommonMark/GFM markdown. The server-side afterRead hook converts
 * to HTML before REST delivery — this component never sees or produces HTML.
 *
 * Crepe is loaded dynamically (ssr: false) because it uses browser-only APIs
 * (ProseMirror + CodeMirror) that break under Next.js App Router SSR.
 */
import React, { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import dynamic from 'next/dynamic'
import { FieldDescription, useField, useLocale, useTranslation } from '@payloadcms/ui'
import { getTranslation } from '@payloadcms/translations'
import type { TextFieldClientProps } from 'payload'

import {
  createInitialFlushGuardState,
  flushGuardRemountKey,
  LOCALE_SWITCH_FLUSH_DELAY_MS,
  reduceFlushGuardState,
  shouldAllowPendingLocaleWrite,
} from './markdown-editor-locale-flush-guard'
// Reused rather than re-reading `useFormFields` directly (Phase 8's media-
// modal tenant-scoping diff, `reports/phase-08-media-modal-report.md` §3):
// `useSiteId` already handles both a populated-relationship-object `tenant`
// value and the tenant-less `Sites` collection itself (falls back to the
// document's own id, which IS the tenant for that collection) — a raw
// `ctx[0]['tenant']?.value` read would miss both cases.
import { useSiteId } from './use-site-id'

// SSR guard: must be client-only due to browser APIs in Crepe internals.
const MilkdownEditorCore = dynamic(
  () => import('./milkdown-editor-core').then((m) => m.MilkdownEditorCore),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          minHeight: 320,
        }}
      />
    ),
  },
)

export const MarkdownEditorField: React.FC<TextFieldClientProps> = ({ field, path }) => {
  const fieldPath = path ?? field.name
  const { value, setValue } = useField<string>({ path: fieldPath })
  const { code: localeCode } = useLocale()
  const { i18n } = useTranslation()
  const label = getTranslation(field.label ?? field.name, i18n)
  const resolvedValue = value ?? ''
  // Threaded through to the "Insert image" modal's tenant-scoping banner/
  // query filters — see `milkdown-editor-core.tsx`'s `documentTenantId` prop.
  const documentTenantId = useSiteId()

  // Pure reducer (see markdown-editor-locale-flush-guard.ts) that decides
  // WHEN to remount the uncontrolled MilkdownEditorCore instance: it delays
  // a locale-driven remount past Milkdown's ~200ms markdownUpdated debounce
  // window so trailing keystrokes flush before the outgoing locale's
  // instance is destroyed, and it forces a resync remount if `value`
  // changes from something other than this editor's own onChange (e.g. a
  // Payload version restore while the field stays mounted).
  const [guardState, dispatch] = useReducer(
    reduceFlushGuardState,
    undefined,
    () => createInitialFlushGuardState(localeCode, resolvedValue),
  )

  // Read inside the delayed timer callback below without re-arming the
  // timer on every keystroke (see the effect's dependency array).
  const latestValueRef = useRef(resolvedValue)
  useLayoutEffect(() => {
    latestValueRef.current = resolvedValue
  })

  useEffect(() => {
    dispatch({ type: 'locale-change', localeCode })
    const timer = setTimeout(() => {
      dispatch({ type: 'locale-flush-elapsed', latestValue: latestValueRef.current, localeCode })
    }, LOCALE_SWITCH_FLUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [localeCode])

  useEffect(() => {
    dispatch({ type: 'value-changed', value: resolvedValue })
  }, [resolvedValue])

  const handleChange = (next: string) => {
    // Defensive gate against the cross-locale corruption race (hazard #3 in
    // markdown-editor-locale-flush-guard.ts): while a locale switch is
    // pending, this outgoing-locale editor instance may still emit a
    // trailing debounced write. If Payload's async locale swap already
    // landed (the field's live value no longer matches what was captured
    // when the pending window armed), applying `next` would silently
    // overwrite the NEW locale's freshly loaded value with stale OLD-locale
    // content. Drop the write in that case — bounded trailing-keystroke
    // loss (the pre-existing, accepted behavior) instead of unbounded
    // cross-locale corruption.
    if (!shouldAllowPendingLocaleWrite(guardState, resolvedValue)) return
    dispatch({ type: 'value-emitted', value: next })
    setValue(next)
  }

  return (
    <div className="field-type text">
      {label && (
        <label className="field-label" htmlFor={fieldPath}>
          {label}
        </label>
      )}
      <MilkdownEditorCore
        key={`${fieldPath}-${flushGuardRemountKey(guardState)}`}
        markdown={resolvedValue}
        onChange={handleChange}
        documentTenantId={documentTenantId}
      />
      <FieldDescription description={field.admin?.description} path={fieldPath} />
    </div>
  )
}
