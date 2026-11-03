import React from 'react'
import type { ServerProps } from 'payload'
import { headers } from 'next/headers'
import { EntityType, groupNavItems, formatAdminURL } from '@payloadcms/ui/shared'
import { getTranslation } from '@payloadcms/translations'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { Logout } from '@payloadcms/ui'
import { AdminNavClient, type NavGroupDTO, type TenantContextDTO } from './admin-nav-client'
import { getValidatedAdminTenantId, isSuperAdminUser, type TenantUser } from '@/lib/admin-selected-tenant'

export const AdminNav: React.FC<ServerProps> = async ({
  documentSubViewType,
  i18n,
  locale,
  params,
  payload,
  permissions,
  searchParams,
  user,
  viewType,
  visibleEntities,
}) => {
  const config = payload.config
  const adminRoute = config.routes.admin
  const components = config.admin.components
  const clientProps = { documentSubViewType, viewType }
  const serverProps = { i18n, locale, params, payload, permissions, searchParams, user }
  const renderSlot = (Component: typeof components.beforeNav) =>
    RenderServerComponent({ Component, clientProps, importMap: payload.importMap, serverProps })

  const renderedBeforeNav = renderSlot(components.beforeNav)
  const renderedBeforeNavLinks = renderSlot(components.beforeNavLinks)
  const renderedAfterNavLinks = renderSlot(components.afterNavLinks)
  const renderedAfterNav = renderSlot(components.afterNav)
  const settingsMenu = components.settingsMenu?.map((Component, index) =>
    RenderServerComponent({
      Component,
      clientProps,
      importMap: payload.importMap,
      key: `settings-menu-item-${index}`,
      serverProps,
    }),
  )
  const logout = RenderServerComponent({
    Component: components.logout?.Button,
    Fallback: Logout,
    clientProps,
    importMap: payload.importMap,
    serverProps,
  })

  const groups: NavGroupDTO[] = []
  if (visibleEntities && permissions) {
    const visibleCollections = new Set(visibleEntities.collections)
    const visibleGlobals = new Set(visibleEntities.globals)
    const entities = [
      ...config.collections
        .filter(({ slug }) => visibleCollections.has(slug))
        .map((entity) => ({ type: EntityType.collection as const, entity })),
      ...config.globals
        .filter(({ slug }) => visibleGlobals.has(slug))
        .map((entity) => ({ type: EntityType.global as const, entity })),
    ]

    for (const group of groupNavItems(entities, permissions, i18n)) {
      groups.push({
        label: group.label,
        items: group.entities.map(({ label, slug, type }) => ({
          href: formatAdminURL({
            adminRoute,
            path: `/${type}/${slug}`,
          }),
          label: getTranslation(label, i18n),
          slug,
        })),
      })
    }
  }
  const groupOrder = ['Nội dung', 'Content', 'Thư viện & cấu trúc', 'Library & structure', 'Vận hành', 'Operations', 'Quản trị', 'Administration']
  groups.sort((a, b) => groupOrder.indexOf(a.label) - groupOrder.indexOf(b.label))

  const selectedTenantId = getValidatedAdminTenantId({
    cookieHeader: (await headers()).get('cookie'),
    user: user as TenantUser | null,
  })
  let tenantContext: TenantContextDTO
  if (selectedTenantId) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        depth: 0,
        id: selectedTenantId,
        overrideAccess: false,
        select: { siteKey: true, domain: true },
        user,
      })
      tenantContext = {
        mode: 'selected',
        label: typeof site.siteKey === 'string' ? site.siteKey : i18n.language === 'en' ? 'Site' : 'Website',
        detail: typeof site.domain === 'string' ? site.domain : undefined,
      }
    } catch {
      tenantContext = {
        mode: 'unavailable',
        label: i18n.language === 'en' ? 'Website unavailable' : 'Website không khả dụng',
      }
    }
  } else if (isSuperAdminUser(user as TenantUser | null)) {
    tenantContext = {
      mode: 'all-sites',
      label: i18n.language === 'en' ? 'All websites' : 'Tất cả website',
    }
  } else {
    tenantContext = {
      mode: 'none',
      label: i18n.language === 'en' ? 'No website access' : 'Chưa có website được cấp quyền',
    }
  }

  const accountHref = formatAdminURL({ adminRoute, path: '/account' })
  const accountLabel = typeof user?.email === 'string' ? user.email : undefined

  return (
    <AdminNavClient
      accountHref={accountHref}
      accountLabel={accountLabel}
      afterNav={renderedAfterNav}
      afterNavLinks={renderedAfterNavLinks}
      beforeNav={renderedBeforeNav}
      beforeNavLinks={renderedBeforeNavLinks}
      groups={groups}
      logout={logout}
      settingsMenu={settingsMenu ?? []}
      tenantContext={tenantContext}
    />
  )
}
