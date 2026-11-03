'use client'
import { useMemo } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * Resolves the site (tenant) ID for the document being edited.
 *
 * Reads the document's `tenant` field (handles both a populated relationship
 * object and a bare ID). Falls back to the document ID so the hook also works
 * on the Sites collection itself, where the document IS the site.
 */
export function useSiteId(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantRaw = useFormFields((ctx: any) => ctx[0]?.['tenant']?.value)
  const docInfo = useDocumentInfo()

  return useMemo(() => {
    if (tenantRaw) {
      if (typeof tenantRaw === 'object' && tenantRaw !== null) {
        return String((tenantRaw as { id: string }).id)
      }
      return String(tenantRaw)
    }
    return docInfo?.id != null ? String(docInfo.id) : undefined
  }, [tenantRaw, docInfo?.id])
}
