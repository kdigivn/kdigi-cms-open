import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import {
  changedLockedFields,
  DEMO_ACCOUNT_DELETE_MESSAGE,
  DEMO_ACCOUNT_LOCKED_MESSAGE,
  isDemoAccountEmail,
} from '../lib/demo-accounts'
import { API_KEY_SESSION_ACCOUNT_MESSAGE, changedAccountFields, isApiKeySession } from '../lib/api-key-session'

/**
 * The very first user of a fresh install — registered through the admin's
 * "create first user" screen, i.e. `POST /api/users/first-register` — must be
 * able to create sites and invite other users, so it is promoted to
 * super-admin regardless of the submitted role. Every other user (including
 * Local API / seed-script creations) keeps the role it was created with;
 * creation through the API is itself super-admin-only, see `access.create`.
 */
const promoteFirstUserToSuperAdmin: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const requestUrl = `${req.pathname ?? ''} ${req.url ?? ''}`
  if (!requestUrl.includes('/first-register')) return data
  const { totalDocs } = await req.payload.count({ collection: 'users', req, overrideAccess: true })
  if (totalDocs === 0) return { ...data, role: 'super-admin' }
  return data
}

/**
 * Public demo accounts (`DEMO_ACCOUNT_EMAILS`, opt-in) cannot change their own email, password,
 * API key or API-key switch. Only a request made BY that account is blocked: no `req.user`
 * (Local API / `pnpm demo:reset`) and other users (a super-admin) stay free to manage it.
 */
const lockDemoAccountSelfChange: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !req.user || !originalDoc) return data
  if (String(req.user.id) !== String(originalDoc.id) || !isDemoAccountEmail(originalDoc.email)) return data
  if (changedLockedFields(data, originalDoc).length > 0) {
    throw new APIError(DEMO_ACCOUNT_LOCKED_MESSAGE, 403, null, true)
  }
  return data
}

/**
 * API-key sessions cannot create accounts or change any account's credentials, role or sites —
 * a leaked key must not become a takeover (`src/lib/api-key-session.ts`). Applies to every route.
 */
const lockApiKeySessionAccountChange: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (!isApiKeySession(req.user)) return data
  if (operation === 'create' || changedAccountFields(data, originalDoc).length > 0) {
    throw new APIError(API_KEY_SESSION_ACCOUNT_MESSAGE, 403, null, true)
  }
  return data
}

/** A demo account cannot delete itself (the collection `delete` access is already super-admin-only). */
const blockDemoAccountSelfDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (!req.user || String(req.user.id) !== String(id)) return
  if (isDemoAccountEmail(req.user.email)) throw new APIError(DEMO_ACCOUNT_DELETE_MESSAGE, 403, null, true)
}

/**
 * Users collection with roles and tenant-scoped access.
 *
 * Role model:
 * - super-admin: global access to all tenants, all collections.
 * - admin: full content CRUD + site settings within assigned tenant(s).
 * - editor: content CRUD + publish within assigned tenant(s).
 * - author: create/update own content only, cannot publish.
 *
 * The plugin-multi-tenant injects the `tenants` array field automatically, linking
 * each user to one or more Sites docs. Admin UI shows the tenant selector based on this.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: { vi: 'Người dùng', en: 'User' },
    plural: { vi: 'Người dùng', en: 'Users' },
  },
  admin: {
    useAsTitle: 'email',
    description: 'Tài khoản quản trị — super-admin truy cập toàn bộ, các vai trò khác bị giới hạn theo site (tenant).',
    defaultColumns: ['email', 'role'],
    listSearchableFields: ['email'],
    group: { vi: 'Hệ thống', en: 'System' },
  },
  auth: {
    useAPIKey: true,
    // Session kéo dài 180 ngày (mặc định Payload là 2h → phải đăng nhập lại liên tục).
    // Cookie maxAge bám theo tokenExpiration nên cookie thành persistent (sống qua lần
    // đóng trình duyệt) = "nhớ đăng nhập". Session records của Payload v3 vẫn thu hồi được.
    tokenExpiration: 60 * 60 * 24 * 180,
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'super-admin') return true
      // All non-super-admin roles can only read their own document
      return { id: { equals: user.id } }
    },
    // Only super-admin can create new users
    create: ({ req: { user } }) => user?.role === 'super-admin',
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'super-admin') return true
      // Non-super-admin users can only update themselves (e.g. change password)
      return { id: { equals: user.id } }
    },
    delete: ({ req: { user } }) => user?.role === 'super-admin' && !isApiKeySession(user),
  },
  hooks: {
    beforeValidate: [lockDemoAccountSelfChange, lockApiKeySessionAccountChange],
    beforeChange: [promoteFirstUserToSuperAdmin],
    beforeDelete: [blockDemoAccountSelfDelete],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      // Collection `update` lets every user edit their own document; without this
      // an editor/author could PATCH their own role to super-admin.
      access: {
        update: ({ req: { user } }) => user?.role === 'super-admin',
      },
      options: [
        { label: 'Super Admin', value: 'super-admin' },
        { label: 'Admin (quản lý site)', value: 'admin' },
        { label: 'Editor (biên tập + đăng bài)', value: 'editor' },
        { label: 'Author (viết bài, chờ duyệt)', value: 'author' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Vai trò người dùng — xác định quyền truy cập trong site được gán.',
      },
    },
    // The plugin-multi-tenant auto-injects a `tenants` array field here,
    // each row having a `tenant` relationship to Sites.
    // Do not manually redeclare it — the plugin owns that field.
  ],
}
