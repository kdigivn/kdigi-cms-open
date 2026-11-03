/**
 * Redirects collection — URL redirect rules per tenant.
 *
 * Enables editors to manage 301/302 redirects without code deploys.
 * frontend middleware fetches the enabled list and matches inbound paths.
 *
 * Tenant isolation: multi-tenant plugin auto-injects the `tenant` field.
 * Public read allowed (unauthenticated) so frontend can fetch the list without auth.
 */
import type { CollectionConfig, Where } from 'payload'
import { tenantScopedRead, tenantScopedWrite } from '../access/tenant-scoped'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: {
    singular: { vi: 'Chuyển hướng', en: 'Redirect' },
    plural: { vi: 'Chuyển hướng', en: 'Redirects' },
  },
  admin: {
    useAsTitle: 'from',
    description: 'Quy tắc chuyển hướng URL — thay thế plugin WP Redirection.',
    defaultColumns: ['from', 'to', 'statusCode', 'isEnabled'],
    listSearchableFields: ['from', 'to'],
    group: { vi: 'Hệ thống', en: 'System' },
  },
  access: {
    // Public read: frontend fetches the full enabled list without auth
    read: ({ req }) => {
      if (!req.user) return true
      return tenantScopedRead({ req })
    },
    create: tenantScopedWrite,
    update: tenantScopedWrite,
    delete: tenantScopedWrite,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        // Normalize `from`: ensure leading slash, strip trailing whitespace
        if (typeof data.from === 'string') {
          const normalized = data.from.trim()
          data.from = normalized.startsWith('/') ? normalized : `/${normalized}`
        }

        // Normalize `to`: trim whitespace
        if (typeof data.to === 'string') {
          data.to = data.to.trim()
        }

        // Reject self-referential redirects at validation time
        if (data.from && data.to) {
          const fromNorm = data.from.trim()
          const toNorm = (data.to as string).trim()
          if (fromNorm === toNorm) {
            throw new Error('Đường dẫn nguồn và đích không được giống nhau.')
          }
          // Block external URLs — only local paths allowed for security
          if (toNorm.startsWith('http://') || toNorm.startsWith('https://')) {
            throw new Error('Đích chuyển hướng phải là đường dẫn nội bộ (bắt đầu bằng /).')
          }
        }

        return data
      },
      // Chain-loop guard: warn (do not block) if `to` matches an existing
      // redirect's `from` within the same tenant. Multi-hop chains
      // (/a → /b → /a) are intentional in some flows; the frontend
      // middleware enforces a MAX_REDIRECT_HOPS ceiling at runtime instead.
      async ({ data, req, originalDoc }) => {
        if (!data?.to || !data?.from) return data
        const fromNorm = String(data.from).trim()
        const toNorm = String(data.to).trim()
        if (!fromNorm || !toNorm) return data

        // Resolve tenant from the in-flight document. On create, `data.tenant`
        // is the source; on update, prefer the originalDoc tenant (already
        // persisted) and fall back to data.
        const tenantRef =
          (originalDoc as { tenant?: string | { id: string } } | undefined)?.tenant ??
          (data as { tenant?: string | { id: string } }).tenant
        const tenantId = typeof tenantRef === 'string' ? tenantRef : tenantRef?.id
        if (!tenantId) return data

        // Exclude the current document so re-saves don't self-trigger.
        const and: Where[] = [
          { tenant: { equals: tenantId } },
          { from: { equals: toNorm } },
        ]
        if (originalDoc?.id) {
          and.push({ id: { not_equals: originalDoc.id } })
        }
        const where: Where = { and }

        try {
          const existing = await req.payload.find({
            collection: 'redirects',
            where,
            limit: 1,
            depth: 0,
          })
          if (existing.totalDocs > 0) {
            req.payload.logger.warn(
              `Potential redirect chain: ${fromNorm} → ${toNorm} (reverse exists in tenant ${tenantId})`,
            )
          }
        } catch {
          // Guard must never block save — failures are non-fatal.
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      required: true,
      admin: {
        description: 'Đường dẫn cũ, bắt đầu bằng /, ví dụ /tin-tuc/bai-cu/',
      },
    },
    {
      name: 'to',
      type: 'text',
      required: true,
        admin: {
          description: 'Đích chuyển hướng — đường dẫn nội bộ bắt đầu bằng /',
        },
    },
    {
      name: 'statusCode',
      type: 'select',
      required: true,
      defaultValue: '301',
      options: [
        { label: '301 — Chuyển hướng vĩnh viễn (Permanent)', value: '301' },
        { label: '302 — Chuyển hướng tạm thời (Temporary)', value: '302' },
      ],
      admin: {
        description: 'Mã HTTP — 301 cho SEO (URL đã đổi vĩnh viễn), 302 cho tạm thời.',
        position: 'sidebar',
      },
    },
    {
      name: 'isEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Bật/tắt quy tắc này mà không cần xóa.',
        position: 'sidebar',
      },
    },
  ],
}
