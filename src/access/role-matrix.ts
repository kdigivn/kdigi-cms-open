/**
 * Role matrix helpers — centralizes permission logic for all roles.
 *
 * Role hierarchy (additive, does not reduce existing permissions):
 *   super-admin > admin > editor > author
 */

/** Minimal user shape used by these helpers. Compatible with Payload's User type
 *  (which has `id: number` and `role: <union>`) — no index signature to avoid
 *  conflict with strict object types from the generated payload-types.ts. */
type UserWithRole = {
  role?: string
  id?: string | number
}

/**
 * Roles that can create/read/update content (pages, posts, products, landings).
 * author is included — they can manage their own docs via ownership check.
 */
export function canManageContent(user: UserWithRole | null | undefined): boolean {
  if (!user?.role) return false
  return ['super-admin', 'admin', 'editor', 'author'].includes(user.role)
}

/**
 * Roles that can publish content (set status to 'published').
 * author is excluded — they cannot publish their own content.
 */
export function canPublish(user: UserWithRole | null | undefined): boolean {
  if (!user?.role) return false
  return ['super-admin', 'admin', 'editor'].includes(user.role)
}

/**
 * Roles that can manage site settings (Sites collection).
 * Sites create/delete stay super-admin only; admin may update site settings.
 */
export function canManageSiteSettings(user: UserWithRole | null | undefined): boolean {
  if (!user?.role) return false
  return ['super-admin', 'admin'].includes(user.role)
}

/**
 * Roles that can moderate comments (approve/reject/delete).
 * Mirrors editor-level access for comment moderation.
 */
export function canModerateComments(user: UserWithRole | null | undefined): boolean {
  if (!user?.role) return false
  return ['super-admin', 'admin', 'editor'].includes(user.role)
}

/**
 * Roles that can PERMANENTLY delete content (SP1a-2). Everyone who can manage content may
 * move it to the trash; emptying the trash / hard delete is admin-level.
 */
export function canPermanentlyDelete(user: UserWithRole | null | undefined): boolean {
  if (!user?.role) return false
  return ['super-admin', 'admin'].includes(user.role)
}

/**
 * Returns true if this user is an author-role user
 * (used in beforeChange hooks to enforce ownership + no-publish rules).
 */
export function isAuthorRole(user: UserWithRole | null | undefined): boolean {
  return user?.role === 'author'
}
