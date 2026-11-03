'use client'
/**
 * Payload admin field component — visual color picker for branding/theme colors.
 * Registered via `admin.components.Field` on text fields that store a CSS color
 * (branding.primaryColor, branding.colors[].value, manifest.themeColor).
 *
 * Stores a plain string (same as a text field) — REST/GraphQL shape is unchanged.
 * Renders a native swatch picker beside a free-text input so editors can either
 * click a color or type any CSS value (hex, rgb(), hsl(), named colors).
 *
 * The native <input type="color"> only understands 6-digit hex, so it mirrors the
 * text value only when that value is hex; non-hex values stay editable via text.
 */
import React, { useCallback } from 'react'
import { FieldDescription, useField, useTranslation } from '@payloadcms/ui'
import { getTranslation } from '@payloadcms/translations'
import type { TextFieldClientProps } from 'payload'

const HEX6 = /^#[0-9a-fA-F]{6}$/

export const ColorPickerField: React.FC<TextFieldClientProps> = ({ field, path }) => {
  const fieldPath = path ?? field.name
  const { value, setValue } = useField<string>({ path: fieldPath })
  const { i18n } = useTranslation()
  const label = getTranslation(field.label ?? field.name, i18n)
  const required = (field as { required?: boolean }).required

  const current = value ?? ''
  // Native picker needs a valid hex; default the swatch to a neutral when not hex.
  const swatch = HEX6.test(current) ? current : '#000000'

  const onSwatch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    [setValue],
  )
  const onText = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    [setValue],
  )

  return (
    <div className="field-type text">
      {label && (
        <label className="field-label" htmlFor={fieldPath}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          aria-label={`${label} — ${i18n.language === 'en' ? 'color swatch' : 'bảng màu'}`}
          value={swatch}
          onChange={onSwatch}
          style={{
            width: 40,
            height: 40,
            padding: 0,
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        />
        <input
          id={fieldPath}
          type="text"
          className="field-input"
          value={current}
          onChange={onText}
          placeholder="#00a86b"
          style={{ flex: 1 }}
        />
        <span
          aria-hidden
          title={current || 'none'}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '1px solid var(--theme-elevation-150)',
            background: current || 'transparent',
            flexShrink: 0,
          }}
        />
      </div>
      <FieldDescription description={field.admin?.description} path={fieldPath} />
    </div>
  )
}
