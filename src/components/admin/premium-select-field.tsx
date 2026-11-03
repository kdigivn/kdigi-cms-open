'use client'

import React, { useCallback, useMemo } from 'react'
import { getTranslation } from '@payloadcms/translations'
import { useField, useTranslation, withCondition } from '@payloadcms/ui'
import type { SelectFieldClientProps, Validate } from 'payload'
import { PremiumFieldFrame } from './premium-field-frame'

function SelectControl({ field, onChange, path: suppliedPath, readOnly, validate }: SelectFieldClientProps) {
  const { i18n } = useTranslation()
  const placeholder = typeof field.admin?.placeholder === 'string'
    ? field.admin.placeholder
    : field.admin?.placeholder && typeof field.admin.placeholder === 'object'
      ? Object.fromEntries(Object.entries(field.admin.placeholder).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : undefined
  // Native Select emits null on clear; its client callback type omits null.
  const notifyChange = onChange as ((value: string | null) => void) | undefined
  const options = useMemo(() => field.options.map((option) => typeof option === 'string' ? { label: option, value: option } : option), [field.options])
  const validateValue = useCallback<Validate>((value, validationOptions) =>
    validate?.(value, { ...validationOptions, name: field.name, type: 'select', required: field.required, hasMany: false, options }) ?? true,
  [field.name, field.required, options, validate])
  const { customComponents, disabled, path, selectFilterOptions, setValue, showError, value } = useField<string>({ potentiallyStalePath: suppliedPath, validate: validateValue })
  const id = `field-${path.replace(/\./g, '__')}`
  const visibleOptions = selectFilterOptions
    ? options.filter((option) => selectFilterOptions.some((allowed) => (typeof allowed === 'string' ? allowed : allowed.value) === option.value))
    : options

  return (
    <PremiumFieldFrame field={{ ...field, type: 'select' }} path={path} showError={showError} customComponents={customComponents}>
      <select
        className="harbor-field__control harbor-field__control--select"
        id={id}
        name={path}
        disabled={readOnly || disabled}
        aria-required={field.required}
        aria-invalid={showError}
        aria-describedby={`${id}-description${showError ? ` ${id}-error` : ''}`}
        value={value ?? ''}
        onChange={(event) => {
          const nextValue = event.target.value || null
          notifyChange?.(nextValue)
          setValue(nextValue)
        }}
      >
        <option value="" disabled={field.admin?.isClearable === false}>
          {getTranslation(placeholder || { en: 'Select an option', vi: 'Chọn giá trị' }, i18n)}
        </option>
        {visibleOptions.map((option) => <option key={option.value} value={option.value}>{getTranslation(option.label, i18n)}</option>)}
      </select>
    </PremiumFieldFrame>
  )
}

export const PremiumSelectField = withCondition(SelectControl)
