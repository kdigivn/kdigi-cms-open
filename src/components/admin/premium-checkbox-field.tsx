'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { useField, withCondition } from '@payloadcms/ui'
import type { CheckboxFieldClientProps, Validate } from 'payload'
import { Checkbox } from '@/components/ui/checkbox'
import { PremiumFieldFrame } from './premium-field-frame'
function CheckboxControl({ checked, disableFormData, field, onChange, partialChecked, path: suppliedPath, readOnly, validate }: CheckboxFieldClientProps) {
  const ref = useRef<HTMLInputElement>(null)
  const validateValue = useCallback<Validate>((value, options) => validate?.(value, { ...options, name: field.name, type: 'checkbox', required: field.required }) ?? true, [field.name, field.required, validate])
  const { customComponents, disabled, path, setValue, showError, value } = useField<boolean>({ disableFormData, potentiallyStalePath: suppliedPath, validate: validateValue })
  const id = `field-${path.replace(/\./g, '__')}`
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(partialChecked)
  }, [partialChecked])

  return (
    <PremiumFieldFrame field={{ ...field, type: 'checkbox' }} path={path} showError={showError} customComponents={customComponents}>
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id={id}
          checked={checked ?? Boolean(value)}
          disabled={readOnly || disabled}
          aria-required={field.required}
          aria-invalid={showError}
          aria-describedby={`${id}-description${showError ? ` ${id}-error` : ''}`}
          onCheckedChange={(checkedState) => {
            const next = Boolean(checkedState)
            setValue(next)
            onChange?.(next)
          }}
          className="size-5 rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <input
          ref={ref}
          type="hidden"
          name={path}
          value={String(Boolean(value))}
        />
      </div>
    </PremiumFieldFrame>
  )
}

export const PremiumCheckboxField = withCondition(CheckboxControl)
