/**
 * Shared constants for the picker fixtures (`@` link picker, `/snippet`).
 * Seeded by `seed-e2e-admin.ts`; read by `e2e/editor-pickers.spec.ts`.
 * Split out so importing them never runs the seed script (same rule as `e2e-editor-fixture.ts`).
 *
 * Every title shares the token "E2E picker" so one query reaches all of them, and each
 * variant differs in exactly the property a test is about (tenant, live, draft, scheduled).
 */

/** Second tenant: its docs must never show up for tenant A. */
export const E2E_PICKER_TENANT_B_SITE_KEY = 'e2e-fixture-b'
export const E2E_PICKER_TENANT_B_DOMAIN = '192.0.2.11'

export const E2E_PICKER_QUERY = 'e2e picker'

export const E2E_PICKER_LIVE_TITLE = 'Lịch mẫu E2E picker'
export const E2E_PICKER_LIVE_SLUG = 'lich-tau-e2e-picker-phu-quoc'

export const E2E_PICKER_SCHEDULED_TITLE = 'Lịch mẫu E2E picker sắp đăng'
export const E2E_PICKER_SCHEDULED_SLUG = 'lich-tau-e2e-picker-sap-dang'

export const E2E_PICKER_DRAFT_TITLE = 'Lịch mẫu E2E picker bản nháp'
export const E2E_PICKER_DRAFT_SLUG = 'lich-tau-e2e-picker-ban-nhap'

export const E2E_PICKER_TENANT_B_TITLE = 'Lịch mẫu E2E picker tenant B'
export const E2E_PICKER_TENANT_B_SLUG = 'lich-tau-e2e-picker-tenant-b'

export const E2E_SNIPPET_NAME = 'e2e-bang-gia'
export const E2E_SNIPPET_TITLE = 'Bảng giá E2E'
export const E2E_SNIPPET_MARKDOWN = 'Giá E2E: **350.000đ** mỗi chiều.'

/** Tenant-A author (not super-admin): the [RT-7] forged-cookie case needs a scoped user. */
export const E2E_AUTHOR_EMAIL = 'e2e-author@local.test'
export const E2E_AUTHOR_PASSWORD = 'E2ePlaywrightAuthor!1'
