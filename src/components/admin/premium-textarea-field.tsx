'use client'

import React, { useCallback } from 'react'
import { getTranslation } from '@payloadcms/translations'
import { isFieldRTL, useConfig, useField, useLocale, useTranslation, withCondition } from '@payloadcms/ui'
import type { TextareaFieldClientProps, Validate } from 'payload'
import { PremiumFieldFrame } from './premium-field-frame'

function TextareaControl({ field, path: suppliedPath, readOnly, validate }: TextareaFieldClientProps) {
  const { i18n } = useTranslation()
  const locale = useLocale()
  const { config } = useConfig()
  const validateValue = useCallback<Validate>((value, options) =>
    validate?.(value, { ...options, name: field.name, type: 'textarea', required: field.required, minLength: field.minLength, maxLength: field.maxLength }) ?? true,
  [field.name, field.maxLength, field.minLength, field.required, validate])
  const { customComponents, disabled, path, setValue, showError, value } = useField<string>({ potentiallyStalePath: suppliedPath, validate: validateValue })
  const id = `field-${path.replace(/\./g, '__')}`
  const rtl = isFieldRTL({ fieldLocalized: field.localized, fieldRTL: field.admin?.rtl, locale, localizationConfig: config.localization || undefined })

  return (
    <PremiumFieldFrame field={{ ...field, type: 'textarea' }} path={path} showError={showError} customComponents={customComponents}>
      <textarea
        className="harbor-field__control harbor-field__control--textarea"
        id={id}
        name={path}
        data-rtl={rtl}
        disabled={readOnly || disabled}
        aria-required={field.required}
        aria-invalid={showError}
        aria-describedby={`${id}-description${showError ? ` ${id}-error` : ''}`}
        placeholder={getTranslation(field.admin?.placeholder ?? '', i18n)}
        rows={field.admin?.rows ?? 4}
        onChange={(event) => setValue(event.target.value)}
        value={value ?? ''}
      />
    </PremiumFieldFrame>
  )
}

export const PremiumTextareaField = withCondition(TextareaControl)
