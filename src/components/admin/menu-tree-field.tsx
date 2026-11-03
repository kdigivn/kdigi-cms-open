'use client'
/**
 * Payload custom field component for the `tree` json field on the Menus collection.
 *
 * Thin wrapper: reads/writes Payload form state via useField, then delegates
 * all rendering and interaction to MenuTreeBuilder. Non-blocking validation
 * shows inline warnings but still calls setValue so editors don't lose work.
 *
 * Registered in menus.ts: admin.components.Field = '@/components/admin/menu-tree-field#MenuTreeField'
 * and in importMap.js with a deterministic alias suffix.
 */
import React, { useCallback } from 'react'
import { FieldDescription, useField, useTranslation } from '@payloadcms/ui'
import { getTranslation } from '@payloadcms/translations'
import type { JSONFieldClientProps } from 'payload'
import type { MenuNode } from '../../lib/menu-tree-types'
import { MenuTreeBuilder } from './menu-tree-builder'

export const MenuTreeField: React.FC<JSONFieldClientProps> = ({ field, path }) => {
  const fieldPath = path ?? field.name
  const { value, setValue } = useField<MenuNode[]>({ path: fieldPath })

  const { i18n } = useTranslation()
  const label = getTranslation(field.label ?? field.name, i18n)

  const handleChange = useCallback(
    (tree: MenuNode[]) => {
      setValue(tree)
    },
    [setValue],
  )

  return (
    <div className="field-type">
      {label && (
        <label className="field-label">
          {label}
        </label>
      )}
      <FieldDescription description={field.admin?.description} path={fieldPath} />
      <div className="twp">
        <MenuTreeBuilder value={value ?? []} onChange={handleChange} />
      </div>
    </div>
  )
}
