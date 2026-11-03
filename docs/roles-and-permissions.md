# Roles and Permissions

How KDIGI CMS decides who can read and write what: the role hierarchy, site-scoped access predicates, public versus authenticated reads, field-level secrets, and how users are assigned to sites.

Related: [multi-site.md](multi-site.md) (the Sites model), [collections.md](collections.md) (per-collection fields), [rest-api.md](rest-api.md) (endpoints), [architecture.md](architecture.md).

> **Terminology.** The *Sites* collection (`sites`) is the tenant boundary. Prose says "site"; code, the generated types and REST payloads call the same thing `tenant` (relationship field `tenant`, user field `tenants[]`, cookie `payload-tenant`).

## Roles

The `role` select on **Users** (`src/collections/users.ts`) is required and defaults to `editor`. Helper predicates live in `src/access/role-matrix.ts`.

Hierarchy (additive): `super-admin` > `admin` > `editor` > `author`.

| Role | Scope | Summary |
| --- | --- | --- |
| `super-admin` | All sites | Bypasses every site filter. Only role that can create or delete users and sites, edit per-site storage settings (`sites.r2`), assign users to sites, and run jobs. |
| `admin` | Assigned sites | Content CRUD, publishing, comment moderation, site settings, permanent delete (empty trash). |
| `editor` | Assigned sites | Content CRUD, publishing, comment moderation, move to trash. |
| `author` | Assigned sites | Create content and edit/trash **only their own** documents. **Cannot publish.** Cannot moderate comments. |

The first user created on a fresh install automatically becomes `super-admin`; see [Assigning users to sites](#assigning-users-to-sites).

### Helper predicates (`src/access/role-matrix.ts`)

| Helper | Roles that pass | Used for |
| --- | --- | --- |
| `canManageContent` | super-admin, admin, editor, author | create/update/trash on pages, posts, products, landings |
| `canPublish` | super-admin, admin, editor | publish rule (author excluded; enforced by a hook, see below) |
| `canManageSiteSettings` | super-admin, admin | site settings |
| `canModerateComments` | super-admin, admin, editor | update/delete on `comments` |
| `canPermanentlyDelete` | super-admin, admin | hard delete / empty trash |
| `isAuthorRole` | author | ownership clauses and publish guard |

### The author rules

Authors are restricted in two places:

1. **Access predicates** (pages, posts, products, landings): `update` returns `{ createdBy: { equals: user.id } }` for `author`; trash (`delete` access) adds the same clause.
2. **`enforceAuthorPermissions`** (`src/hooks/enforce-author-permissions.ts`, `beforeChange`):
   - throws a bilingual error if the *effective* status (`data.status ?? originalDoc.status`) is `published`, so an author can neither publish nor edit a live document in place, nor restore a published document from the trash. Moving their own document **to** the trash is allowed;
   - sets `createdBy = user.id` on create (`createdBy` has field-level `update: () => false`, so it cannot be reassigned afterwards).

Authors can still create and edit `taxonomies`, `authors`, `menus`, `faqs`, `shortcodes`, `redirects` and `media` inside their sites: those collections use the plain site-scoped predicates without ownership clauses. Grant `author` accordingly.

## Site-scoped predicates

Defined in `src/access/tenant-scoped.ts`; membership helpers in `src/lib/admin-selected-tenant.ts`.

| Predicate | Behaviour |
| --- | --- |
| `tenantScopedRead` | No user → `false`. `super-admin` → `true`. Otherwise `{ tenant: { in: <user's site ids> } }`; a user with no sites gets `false`. |
| `tenantScopedWrite` | Same shape, used for create/update/delete. |
| `tenantScopedVersionsRead` | Version history (`readVersions`); same rule on `version.tenant`. Anonymous callers get nothing. |
| `hasAnyTenantOrSuperAdmin` | Boolean gate for `media` and `payload-folders` **create** (the row does not exist yet): super-admin, or a user who belongs to at least one site. |
| `makeContentDeleteAccess` | `src/access/content-delete-access.ts`. Trash = update with `deletedAt`; permanent delete = no data. Trash: any `canManageContent` role (authors only own docs, where `createdBy` exists); permanent: `canPermanentlyDelete`. Always AND-ed with `tenantScopedWrite`. |
| `publishedAndLive` | `src/access/published-and-live.ts`. Anonymous content read, see below. |

A user's site ids come from `user.tenants[].tenant` (the array is injected on Users by the multi-tenant plugin).

### Site ids supplied by the client

Endpoints and admin widgets that accept a site id (`?tenantId=`, body field, or the `payload-tenant` cookie) never trust it directly (`src/lib/admin-selected-tenant.ts`, `src/lib/resolve-tenant-from-request.ts`). The id is honoured only for a super-admin or a member of that site; otherwise it falls back to the user's first site. If nothing resolves, endpoints answer 400 rather than run unscoped.

### Plugin filter versus the real boundary

`@payloadcms/plugin-multi-tenant` is configured with `tenantsSlug: 'sites'` (`src/payload.config.ts`). It contributes two different things:

| Layer | What it does | Treat as |
| --- | --- | --- |
| Admin list filter (`baseFilter` + site selector, `payload-tenant` cookie) | Narrows lists in the admin UI to the selected site. | **Advisory.** A UI convenience, not a security control. |
| Repo access predicates (`src/access/*`) | Explicit `where` constraints on every operation. | **The boundary.** Every site-scoped collection declares them itself. |

In the pinned plugin version (3.90.2) the plugin additionally wraps the access functions of listed collections, `sites` and `users` with a membership constraint for non-super-admin users (`withTenantAccess` in the plugin's `dist/utilities`). That is defence in depth; do not rely on it alone. When adding a site-scoped collection, add it to the plugin's `collections` map **and** declare `tenantScopedRead`/`tenantScopedWrite` (and `readVersions` if it has versions) on the collection.

`media` and `payload-folders` are not plugin-managed; they declare their own `tenant` field and predicates (`src/collections/media.ts`, `src/collections/payload-folders-tenant-scope.ts`).

## Public versus authenticated reads

| Caller | Content collections (`pages`, `posts`, `products`, `landings`) |
| --- | --- |
| Anonymous | `publishedAndLive()`: not trashed (`deletedAt` absent), `status = 'published'`, and `publishedAt` missing or `<= now` (evaluated per request, so scheduled posts go live on time). |
| Authenticated, non-super-admin | `tenantScopedRead`: all statuses (including drafts) for their sites. |
| Super-admin | Everything. |

**Anonymous reads are not filtered by site.** Neither `publishedAndLive()` nor the public `read: () => true` rules add a `tenant` clause, so a frontend MUST add `where[tenant][equals]=<siteId>` to every query or it will mix content from all sites. See [multi-site.md](multi-site.md#how-a-frontend-selects-its-site).

API keys (`Users` has `auth.useAPIKey: true`) authenticate as the owning user and are subject to the same role and site rules. `Authorization: users API-Key <key>` is the supported header form.

## Field-level secrets and protected fields

| Field | Rule |
| --- | --- |
| `sites.r2.accessKeyId`, `sites.r2.secretAccessKey` | `access.read: () => false`: never in REST or GraphQL responses. Server code reads them with the Local API and `overrideAccess: true`. |
| `sites.r2` group | `access.update`: super-admin only. |
| `authors.email` | `access.read: () => false`. |
| `comments.authorEmail` | `access.read: () => false`. |
| `media.tenant`, `payload-folders.tenant` | `access.update`: super-admin only (no reassigning ownership). |
| `posts/pages/products/landings.createdBy` | `access.update: () => false`. |
| `commentCount` (posts, products), `kkStarRating` (products) | `access.update: () => false`; maintained by hooks and the rating endpoint. |
| `users.tenants[]` | Create/update: super-admin only (plugin `arrayFieldAccess` default with `userHasAccessToAllTenants`). |

Secrets are written through the write-only editors in the Sites form, which call `POST /api/sites/:id/secret` (super-admin only; allow-listed paths `r2.accessKeyId`, `r2.secretAccessKey`). `GET /api/sites/:id/secret?field=<path>` returns only `{ field, hasValue }`, never the value (`src/endpoints/site-secret-endpoint.ts`).

> **`overrideAccess: true` bypasses field access too.** Any custom handler that uses the Local API with `overrideAccess: true` can read secret fields. Such handlers must restrict what they return. The public `GET /api/sites/:siteKey/env-page` endpoint deliberately uses `overrideAccess: false`.

## Per-collection access summary

"Site-scoped" means the predicates above (super-admin all; others only their sites). "Public" means no authentication required.

| Collection | Read (anonymous) | Read (authenticated) | Create | Update | Delete |
| --- | --- | --- | --- | --- | --- |
| `users` | none | super-admin all; others own document only | super-admin | super-admin any; others own document, but `role` and `tenants` are super-admin-only (writes by others are dropped) | super-admin |
| `sites` | public | public rule; plugin narrows non-super-admin to assigned sites | super-admin | super-admin, admin (plugin narrows to assigned sites); `r2` group super-admin only | super-admin |
| `media` | public | public | any user with ≥1 site (`hasAnyTenantOrSuperAdmin`) | site-scoped | site-scoped |
| `payload-folders` | none | site-scoped | `hasAnyTenantOrSuperAdmin` | site-scoped | site-scoped |
| `pages`, `posts`, `products`, `landings` | `publishedAndLive()` | site-scoped (+ `readVersions`) | `canManageContent` | `canManageContent`; author only own | trash: `canManageContent` (author own); permanent: super-admin/admin; all site-scoped |
| `taxonomies` | public | site-scoped (+ `readVersions`) | site-scoped | site-scoped | site-scoped |
| `authors` | public (email hidden) | site-scoped | site-scoped | site-scoped | site-scoped |
| `menus` | public | site-scoped | site-scoped | site-scoped | site-scoped |
| `faqs` | public, not trashed | site-scoped (+ `readVersions`) | site-scoped | site-scoped | trash: any site-scoped writer; permanent: super-admin/admin |
| `shortcodes` | public, not trashed | site-scoped (+ `readVersions`) | site-scoped | site-scoped | as `faqs` |
| `redirects` | public | site-scoped | site-scoped | site-scoped | site-scoped |
| `comments` | `status = 'approved'` only | site-scoped | site-scoped (public submissions use `POST /api/comments/create`) | `canModerateComments` + site-scoped | `canModerateComments` + site-scoped |
| `rating-events` | none | none | none | none | none (written only by `POST /api/ratings/submit` with `overrideAccess: true`) |

Notes:

- The `faqs` and `shortcodes` delete rule uses `makeContentDeleteAccess({ hasCreatedBy: false })`: they have no `createdBy`, so there is no author ownership clause, but the "permanent delete is admin-only" rule applies.
- Trash (`trash: true`) is enabled on `pages`, `posts`, `products`, `landings`, `faqs`, `shortcodes`. The anonymous predicates include `deletedAt: { exists: false }`, so `?trash=true` cannot widen a public read.
- Authenticated reads include trashed rows only when the caller passes `trash=true`.

## Assigning users to sites

0. **The very first user** of a fresh install (created on the admin's "create first user" screen) is promoted to `super-admin` regardless of the submitted role (`promoteFirstUserToSuperAdmin`, a `beforeChange` hook on Users). Every later user keeps the role it is created with, and creating users is super-admin-only.
1. A **super-admin** creates the user in Users and picks a `role` (default `editor`).
2. On the same document the super-admin adds one row per site to the `tenants` array (label "Website" in the admin). The array is added by the multi-tenant plugin; do not redeclare it.
3. The user then sees only those sites in the admin site selector and in API reads/writes. A user with no rows has no access to any site-scoped document.
4. Non-super-admin users can edit their own account (password, API key) but cannot change their own `role` or `tenants`: the `role` field has `access.update` super-admin-only and the plugin's `tenantsArrayField.arrayFieldAccess.update` is super-admin-only (`src/payload.config.ts`). Regression: `src/collections/users-self-escalation.integration.test.ts`.

A site-scoped create through the REST API must carry `tenant` in the body: the field's default comes from the admin `payload-tenant` cookie, which API clients do not have. The plugin validates that the submitted site is one the user is assigned to (super-admins may use any).

Sessions: `Users` is configured with a 180-day token expiration (`auth.tokenExpiration`), so the admin login persists across browser restarts.

## Jobs and other privileged operations

| Operation | Rule |
| --- | --- |
| Run queued jobs through `/api/payload-jobs/run` | super-admin only (`jobs.access.run` in `src/payload.config.ts`) |
| Background queue processing | Runs in-process only when `ENABLE_JOBS_AUTORUN=true` (set on exactly one instance). |
| Create/delete a site | super-admin |
| Write/inspect site secrets | super-admin |
