# Admin Theming and Branding

How the KDIGI CMS admin UI is styled, and how to change its colors, logo, name and labels.

The admin is Payload's admin panel with custom components and one stylesheet. Payload still owns authentication, permissions, site (tenant) selection, queries and the document lifecycle; the theme only changes presentation. Branding here applies to the admin only. Each site's own brand (logo, favicon, primary color, theme) is site data on the Sites collection (**Thương hiệu** tab, `branding` group) and is not affected.

## Where things live

| Concern | File |
| --- | --- |
| Theme tokens and all admin CSS overrides | `src/app/(payload)/custom.css` |
| Tailwind v4 entry, scoped to `.twp`, and the shadcn token bridge | `src/app/(payload)/tailwind-admin.css` |
| Loads the CSS and the Inter font (registered as an admin provider) | `src/components/admin/css-injector.tsx` |
| Logo and icon components (`admin.components.graphics`) | `src/components/admin/logo.tsx`, `src/components/admin/icon.tsx` |
| Brand images | `public/brand/` (`kdigi-logo.svg`, `kdigi-logo-white.svg`, `kdigi-mark.svg`) |
| Browser tab title, favicon, description | `admin.meta` in `src/payload.config.ts` |
| Login screen branding | `src/components/admin/login-workspace-panel.tsx` |
| Sidebar, dashboard, list and edit views | `admin-nav*.tsx`, `editorial-dashboard-view.tsx`, `premium-*.tsx` in `src/components/admin/` |
| shadcn/ui primitives | `src/components/ui/` (configured by `components.json`) |
| Markdown editor theme | `src/components/admin/milkdown-theme-tokens.css` and sibling `milkdown-*.css` |

The stylesheet is imported once by `CSSInjector`, registered in `admin.components.providers`. There is no second theme provider; light/dark follows Payload's own theme switch (`admin.theme: 'all'`, stored per user) through the `data-theme` attribute on `<html>`.

## Design tokens

Everything is driven by CSS custom properties defined in `custom.css`.

**Color tokens.** Payload's native `--theme-*` variables, defined once for `:root, [data-theme="light"]` and once for `[data-theme="dark"]`. The default palette is neutral (grayscale OKLCH); the brand accent is a token you can change.

| Token | Role |
| --- | --- |
| `--theme-bg`, `--theme-input-bg`, `--theme-text`, `--theme-muted-text` | Page, input, text, secondary text |
| `--theme-border-color`, `--harbor-control-border` | Decorative borders, control borders |
| `--theme-ring` | Focus ring |
| `--theme-elevation-0` ... `--theme-elevation-1000` | Payload's surface scale |
| `--theme-brand`, `--theme-brand-hover`, `--theme-brand-active` | Accent: primary buttons, links, active nav, checked controls, selected rows |
| `--theme-brand-subtle`, `--theme-brand-muted` | Soft accent backgrounds and borders |
| `--harbor-on-primary` | Text color on top of `--theme-brand` |
| `--theme-nav-bg`, `--theme-nav-border` | Sidebar |

Success, warning and error colors keep their own semantic values; do not replace them with the accent.

**Layout and type tokens** (`:root`, prefixed `--kdigi-`):

| Token group | Examples |
| --- | --- |
| Spacing | `--kdigi-space-1` ... `--kdigi-space-8` (4/8/12/16/24/32 px) |
| Control height | `--kdigi-control-height` (36 px; 44 px on phones), `--kdigi-control-compact-height` (32 px) |
| Type scale | `--kdigi-font-size-meta/body/section/page` (12/14/16/24 px), matching `--kdigi-line-*` and `--kdigi-weight-body/label/heading` |
| Navigation | `--kdigi-nav-width` (256 px), `--kdigi-nav-compact-width` (48 px) |
| Motion | `--kdigi-duration` (160 ms); `prefers-reduced-motion` shortens animations |
| Other | `--font-body` (Inter Variable, then system fonts), `--style-radius-s/m/l` (6/8/10 px), `--app-header-height` |

`html` is 16 px and body text 14 px. `--base-body-size: 16` must match `html`; lowering it produces fractional spacing in Payload's `base()` calculations.

## The `.twp` rule (Tailwind and shadcn)

`tailwind-admin.css` loads only Tailwind's theme and utilities layers (`@layer theme, base, components, utilities`). **No global preflight** is installed, so Payload's own styles are never reset. A minimal reset lives inside `@layer base`, scoped to `.twp` descendants.

Rules for custom React components:

1. Put Tailwind utility classes and shadcn components **inside a wrapper element with class `twp`**: `<div className="twp"><Button variant="outline">Action</Button></div>`.
2. `.twp` maps the shadcn variables (`--background`, `--primary`, `--border`, `--ring`, `--sidebar-*`, ...) onto the `--theme-*` tokens, so shadcn components follow the admin palette in light and dark mode. Do not declare an independent palette.
3. Portaled content (popovers, tooltips, dialogs rendered outside the wrapper) must carry its own `twp` class on the content root, not only on the trigger.
4. `dark:` utilities follow `[data-theme="dark"]` (custom variant in `tailwind-admin.css`).
5. Do not put utilities on Payload's native elements; utilities are generated globally, and `.twp` only scopes the CSS variables and the reset.

```tsx
export const MyPanel = () => (
  <div className="twp rounded-lg border border-border bg-card p-4">
    <Button variant="outline">Action</Button>
  </div>
)
```

`components.json` points the shadcn CLI at `src/app/(payload)/tailwind-admin.css`, so components added with the CLI land in `src/components/ui/` with the `@/` aliases.

## Rebranding

### Colors

Edit `src/app/(payload)/custom.css`:

1. Change the `--theme-brand`, `--theme-brand-hover`, `--theme-brand-active`, `--theme-brand-subtle` and `--theme-brand-muted` values in **both** the light block (`:root, [data-theme="light"]`) and the dark block (`[data-theme="dark"]`). Adjust `--harbor-on-primary` so button text stays readable (and `--theme-ring` if you want a tinted focus ring).
2. Optionally tint the surfaces (`--theme-elevation-*`, `--theme-nav-bg`).
3. Nothing else is required: the `.twp` bridge, the sidebar, buttons, links and the Markdown editor (`milkdown-theme-tokens.css`) all derive from these tokens.

Example (illustrative values):

```css
:root, [data-theme="light"] {
  --theme-brand: oklch(0.55 0.2 260);
  --theme-brand-hover: oklch(0.5 0.2 260);
  --theme-brand-active: oklch(0.45 0.2 260);
  --theme-brand-subtle: oklch(0.96 0.03 260);
  --theme-brand-muted: oklch(0.9 0.06 260);
  --harbor-on-primary: oklch(0.99 0 0);
}
```

Check light and dark mode in `/admin` after the change, including a table row selection, a primary button and the editor.

### Logo and favicon

1. Replace the files in `public/brand/` with your own assets, keeping the file names: `kdigi-logo.svg` (wordmark for light mode), `kdigi-logo-white.svg` (wordmark for dark mode) and `kdigi-mark.svg` (square mark: compact sidebar, header, login, favicon).
2. If you use different names or formats, update the `src` (and `width`/`height`) in `logo.tsx` and `icon.tsx`, and the two `icons` entries in `admin.meta` in `payload.config.ts` (these must be absolute URLs built from `serverURL`).
3. Display sizes come from `custom.css`: `.kdigi-logo` is 128 px wide, `.kdigi-icon` is 28 px (24 px and 20 px in the header). `Logo` renders both wordmarks and CSS shows the one matching `data-theme`.

### Product name and copy

Strings to change when renaming the product:

| String | Location |
| --- | --- |
| Tab title, title suffix, description, Open Graph text | `admin.meta` in `src/payload.config.ts` |
| Header home label (CSS `content`) | `.app-header__step-nav .step-nav__home::after` in `custom.css` |
| Login brand name and tagline | `login-workspace-panel.tsx` |
| Sidebar logo link `aria-label` | `admin-nav-client.tsx` |
| Dashboard welcome line | `editorial-dashboard-view.tsx` |
| `alt` text | `logo.tsx`, `icon.tsx` |

The admin has no Open Graph image (`defaultOGImageType: 'off'`); keep it that way, because Payload's dynamic OG route cannot render the relative image URL the sidebar icon uses.

### Admin labels and languages

The admin UI is bilingual, Vietnamese (default, `fallbackLanguage: 'vi'`) and English (`i18n.supportedLanguages` in `payload.config.ts`). The two choices are independent: the header **Content language** switch changes `?locale=vi|en` for content, the account menu **Interface language** changes the UI.

| What | Where |
| --- | --- |
| Collection names, field labels, descriptions | `labels`, `label` and `admin.description` in `src/collections/*.ts`, usually `{ vi, en }` objects |
| Sidebar groups | `admin.group` in each collection |
| Automatic Vietnamese translation of English field labels/descriptions | `src/lib/admin-display-labels.ts` (lookup tables; display-only, never touches field names, enum values or content). Applied to all collections by `src/lib/apply-premium-admin-presentation.ts` |
| Custom views and widgets | Inline `isEnglish ? '...' : '...'` pairs in the component |
| Editor UI strings | `src/components/admin/milkdown-ui-copy.ts` |
| Payload core labels that need overriding | `i18n.translations` in `payload.config.ts` (for example the content/interface language labels) |

To add a language, add its Payload translation bundle to `i18n.supportedLanguages` and extend the `{ vi, en }` label objects and the `isEnglish` branches you care about.

## Custom admin views

`apply-premium-admin-presentation.ts` only changes admin metadata, labels and component registrations; names, types, access and hooks are untouched. It swaps native text, textarea, select and checkbox inputs for the `premium-*` field components unless a field already has a custom `Field` or is hidden. Other custom surfaces:

| Surface | Component |
| --- | --- |
| Sidebar | `admin-nav.tsx` (server, permission-filtered) and `admin-nav-client.tsx`; collapse state in `localStorage` key `kdigi_cms_sidebar_collapsed` |
| Dashboard | `editorial-dashboard-view.tsx` with `dashboard-widgets.tsx` and `seo-audit-widget.tsx`; shows live counts only |
| Content calendar | `content-calendar/content-calendar-view.tsx`, mounted at `/admin/content-calendar` |
| Collection lists | `premium-collection-list-view.tsx`, `premium-collection-table.tsx` |
| Edit view | `premium-edit-view.tsx`, a wrapper around Payload's default edit view (one form, one save lifecycle) |
| Media Library | `media-grid-list-view.tsx` (see [media-storage.md](media-storage.md)) |
| Markdown editor | `markdown-editor-field.tsx`, `milkdown-editor-core.tsx` (see [content-markdown.md](content-markdown.md)) |

## Markdown editor styling

The editor core imports `@milkdown/crepe/theme/common/style.css`, `@milkdown/crepe/theme/frame.css`, then `milkdown-lark-theme.css`, `milkdown-layer-tokens.css` and `milkdown-editor-core.css`. Its colors come from `--mlk-*` variables defined in `milkdown-theme-tokens.css` in terms of the admin `--theme-*` tokens, so rebranding the accent also rebrands the editor. Layer (z-index) values live in `milkdown-layer-tokens.css`; do not raise the whole editor wrapper above modals.

## Notes

- Spacing, control heights and type sizes have a single owner each (`--kdigi-*` tokens). Prefer changing the token over adding `!important` overrides, and check computed styles when editing the cascade.
- Small screens: the sidebar becomes an overlay below 768 px, settings tabs go horizontal below 1024 px, controls grow to 44 px on phones.
- Payload's `@payloadcms/ui` is patched (`patches/@payloadcms__ui@3.90.2.patch`, declared under `pnpm.patchedDependencies` in `package.json`) so drawer toggler `aria-label`s resolve bilingual labels. Re-check the patch whenever you upgrade Payload; see [upgrading.md](upgrading.md).
- Previewing the admin over plain HTTP from a non-loopback host (LAN IP, hostname) cannot log in, because browsers omit `Origin` and Payload then ignores the auth cookie. Use `localhost`, or HTTPS, and set `PAYLOAD_PUBLIC_SERVER_URL` to the exact origin you open (see [configuration.md](configuration.md)).

See also: [architecture.md](architecture.md), [roles-and-permissions.md](roles-and-permissions.md).
