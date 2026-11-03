'use client'
/**
 * Payload admin field component — slug input with a disabled URL-prefix adornment.
 *
 * Registered via `admin.components.Field` on slug text fields (the shared slugField() factory and
 * the taxonomies inline slug). Renders a greyed, non-editable `https://{domain}/{segment}/` in front
 * of the editable slug so editors see the public URL the slug produces.
 *
 * DISPLAY-ONLY: stores a plain string exactly like a text field — REST/GraphQL shape and the
 * `beforeValidate` auto-slug hooks are unchanged. The prefix is never submitted.
 *
 * Prefix parts:
 *   - domain  ← the doc's `tenant` relationship → Sites.domain (fetched once, cached per tenant)
 *   - segment ← taxonomy `type` sibling (product-category → product-category, ...) or the collection slug (products → product)
 * All composition + fallbacks live in the pure module `src/fields/slug-url-prefix-map.ts`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { FieldDescription, useField, useFormFields, useDocumentInfo, useLocale, useTranslation } from '@payloadcms/ui'
import { getTranslation } from '@payloadcms/translations'
import type { TextFieldClientProps } from 'payload'
import {
  segmentForTaxonomyType,
  segmentForCollection,
  buildSlugUrlPrefix,
  type SlugLocale,
} from '../../fields/slug-url-prefix-map'

/** Read the multi-tenant selector cookie as a fallback when the `tenant` field is hidden/auto-set. */
function readTenantCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)payload-tenant=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

export const SlugPrefixField: React.FC<TextFieldClientProps> = ({ field, path }) => {
  const fieldPath = path ?? field.name
  const { value, setValue } = useField<string>({ path: fieldPath })
  const { i18n } = useTranslation()
  const label = getTranslation(field.label ?? field.name, i18n)
  const required = (field as { required?: boolean }).required

  const { code } = useLocale()
  const locale = (code === 'en' ? 'en' : 'vi') as SlugLocale

  // Sibling taxonomy `type` (top-level field; undefined on non-taxonomy collections).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxonomyType = useFormFields((ctx: any) => ctx[0]?.['type']?.value as string | undefined)
  // Tenant id from the auto-injected `tenant` relationship field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantField = useFormFields((ctx: any) => ctx[0]?.['tenant']?.value)

  const { collectionSlug } = useDocumentInfo()

  // Normalize the relationship value (plain id or `{ id }` object) to a non-empty string;
  // fall back to the selector cookie when the field is empty/hidden or carries no usable id.
  const rawTenant = tenantField && typeof tenantField === 'object'
    ? (tenantField as { id?: unknown }).id
    : tenantField
  const tenantIdFromField = rawTenant != null && rawTenant !== '' ? String(rawTenant) : undefined
  const tenantId = tenantIdFromField ?? readTenantCookie()

  // Cache the resolved domain keyed by tenantId so the effective domain can be derived (no
  // synchronous setState reset when tenantId is absent/changes).
  const [resolved, setResolved] = useState<{
    tenantId: string
    domain: string | undefined
    defaultLanguage?: SlugLocale
  } | null>(null)

  // Fetch the tenant's domain once per tenantId. Failure/missing → undefined → path-only fallback.
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    fetch(`/api/sites/${tenantId}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (!cancelled) {
          setResolved({
            tenantId,
            domain: typeof doc?.domain === 'string' ? doc.domain : undefined,
            defaultLanguage:
              doc?.defaultLanguage === 'en' || doc?.defaultLanguage === 'vi'
                ? doc.defaultLanguage
                : undefined,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setResolved({ tenantId, domain: undefined })
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  // Only trust the cached domain when it belongs to the current tenant.
  const currentSite = resolved && tenantId && resolved.tenantId === tenantId ? resolved : null
  const domain = currentSite?.domain
  const effectiveLocale = currentSite?.defaultLanguage ?? locale

  const segment = taxonomyType
    ? segmentForTaxonomyType(taxonomyType, effectiveLocale)
    : collectionSlug
      ? segmentForCollection(collectionSlug, effectiveLocale)
      : null

  const prefix = buildSlugUrlPrefix({ domain, segment, locale: effectiveLocale })
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
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          overflow: 'hidden',
          background: 'var(--theme-input-bg)',
        }}
      >
        <span
          title={prefix}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 8px',
            maxWidth: '55%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--theme-elevation-450)',
            background: 'var(--theme-elevation-50)',
            borderRight: '1px solid var(--theme-elevation-150)',
            fontSize: 13,
            userSelect: 'none',
            cursor: 'not-allowed',
            flexShrink: 0,
          }}
        >
          {prefix}
        </span>
        <input
          id={fieldPath}
          type="text"
          className="field-input"
          value={value ?? ''}
          onChange={onText}
          style={{ flex: 1, border: 'none', borderRadius: 0, background: 'transparent' }}
        />
      </div>
      <FieldDescription description={field.admin?.description} path={fieldPath} />
    </div>
  )
}
