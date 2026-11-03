'use client'
/**
 * Payload admin field component — visual icon picker for the homepage hero
 * notice badges (Sites.landing.heroNotice1Icon / heroNotice2Icon).
 *
 * Stores the same string key as the underlying `select` field (REST/GraphQL +
 * DB enum shape unchanged). The dropdown renders the ACTUAL icon used by
 * the frontend (react-icons@5.5.0) so the admin sees a true WYSIWYG preview —
 * icon first, label after.
 *
 * IMPORTANT: keys + icon components must stay in sync with the frontend registry
 * HERO_NOTICE_ICONS in the frontend hero section.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FieldDescription, useField, useTranslation } from '@payloadcms/ui'
import { getTranslation } from '@payloadcms/translations'
import type { SelectFieldClientProps } from 'payload'
import type { IconType } from 'react-icons'
import { AiOutlineThunderbolt } from 'react-icons/ai'
import {
  RiCheckboxCircleLine,
  RiCustomerService2Line,
  RiMapPinLine,
  RiSecurePaymentLine,
  RiShieldCheckLine,
  RiTicket2Line,
  RiTimeLine,
} from 'react-icons/ri'

type Option = { value: string; label: string; Icon: IconType }

const OPTIONS: Option[] = [
  { value: 'thunderbolt', label: 'Tia sét', Icon: AiOutlineThunderbolt },
  { value: 'shield', label: 'Khiên (bảo chứng)', Icon: RiShieldCheckLine },
  { value: 'ticket', label: 'Vé / Ticket', Icon: RiTicket2Line },
  { value: 'clock', label: 'Đồng hồ', Icon: RiTimeLine },
  { value: 'payment', label: 'Thanh toán', Icon: RiSecurePaymentLine },
  { value: 'check', label: 'Tích xác nhận', Icon: RiCheckboxCircleLine },
  { value: 'support', label: 'Hỗ trợ', Icon: RiCustomerService2Line },
  { value: 'location', label: 'Vị trí', Icon: RiMapPinLine },
]

export const HeroNoticeIconField: React.FC<SelectFieldClientProps> = ({ field, path }) => {
  const fieldPath = path ?? field.name
  const { value, setValue } = useField<string>({ path: fieldPath })
  const { i18n } = useTranslation()
  const label = getTranslation(field.label ?? field.name, i18n)
  const required = (field as { required?: boolean }).required

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = OPTIONS.find((o) => o.value === value) ?? null

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = useCallback(
    (v: string) => {
      setValue(v)
      setOpen(false)
    },
    [setValue],
  )

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    background: active ? 'var(--theme-elevation-100)' : 'transparent',
    color: 'var(--theme-elevation-800)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 14,
  })

  return (
    <div className="field-type" ref={wrapRef} style={{ position: 'relative' }}>
      {label && (
        <label className="field-label" htmlFor={fieldPath}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}

      <button
        id={fieldPath}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          background: 'var(--theme-input-bg)',
          color: 'var(--theme-elevation-800)',
          cursor: 'pointer',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <selected.Icon size={18} />
            <span style={{ flex: 1, textAlign: 'left' }}>{selected.label}</span>
          </>
        ) : (
          <span style={{ flex: 1, textAlign: 'left', opacity: 0.6 }}>Chọn icon…</span>
        )}
        <span aria-hidden style={{ opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 10,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 320,
            overflowY: 'auto',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-0)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              style={rowStyle(o.value === value)}
            >
              <o.Icon size={18} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}

      <FieldDescription description={field.admin?.description} path={fieldPath} />
    </div>
  )
}
