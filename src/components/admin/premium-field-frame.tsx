'use client'

import React from 'react'
import { FieldDescription, FieldError, FieldLabel, RenderCustomComponent } from '@payloadcms/ui'
import type { ClientField, FormField } from 'payload'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  field: ClientField
  path: string
  showError: boolean
  customComponents?: FormField['customComponents']
}

export function PremiumFieldFrame({ children, customComponents, field, path, showError }: Props) {
  const id = `field-${path.replace(/\./g, '__')}`
  const label = 'label' in field ? field.label : undefined
  const required = 'required' in field ? field.required : undefined
  const localized = 'localized' in field ? field.localized : undefined
  const description = field.admin && 'description' in field.admin ? field.admin.description : undefined
  const staticDescription = typeof description === 'string' || !description ? description : Object.fromEntries(Object.entries(description).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

  return (
    <div
      data-slot="field-container"
      className={cn('field-type harbor-field twp', showError && 'error', field.admin?.className)}
      style={{ width: field.admin?.width }}
    >
      <div
        data-slot="field"
        data-invalid={showError}
        className="group/field data-[invalid=true]:text-destructive flex w-full flex-col"
      >
        <div className="harbor-field__label flex items-center justify-between text-foreground">
          <RenderCustomComponent
            CustomComponent={customComponents?.Label}
            Fallback={<FieldLabel htmlFor={id} label={label} localized={localized} path={path} required={required} />}
          />
        </div>

        {customComponents?.BeforeInput}
        <div className="relative w-full">
          {children}
        </div>
        {customComponents?.AfterInput}

        <div id={`${id}-description`} className="harbor-field__description text-muted-foreground">
          <RenderCustomComponent
            CustomComponent={customComponents?.Description}
            Fallback={<FieldDescription description={staticDescription} path={path} />}
          />
        </div>

        <div id={`${id}-error`} className="harbor-field__error font-medium text-destructive">
          <RenderCustomComponent
            CustomComponent={customComponents?.Error}
            Fallback={<FieldError path={path} showError={showError} />}
          />
        </div>
      </div>
    </div>
  )
}
