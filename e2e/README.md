# Browser smoke tests (Playwright)

A small browser suite for the Markdown (Milkdown) editor and the `@` link picker.
`pnpm test` (`node --test`) only runs `src/**/*.test.ts` and never touches this directory.

## Run it

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # everything
pnpm exec playwright test editor-pickers --project=chromium-dpr1
```

You need a **local** Postgres (`DATABASE_URI` in `.env`) with the schema applied
(`pnpm migrate`).

`playwright.config.ts` starts a **dedicated, instrumented** server on
`http://localhost:3101` (`pnpm dev -p 3101` with `NEXT_PUBLIC_E2E=1`) and `globalSetup`
(`e2e/global-setup.ts`) seeds, idempotently and only against a local database:

1. a fixed-credential local super-admin (`src/scripts/seed-e2e-admin.ts`);
2. the editor fixture site (`e2e-fixture`) and a post (`slug: e2e-editor-fixture`) whose
   body contains the common Markdown blocks — specs resolve it by slug through
   `utils/editor-fixture.ts`, never by a hard-coded id;
3. picker fixtures (`src/scripts/e2e-picker-fixture.ts`): a second site `e2e-fixture-b`,
   live / scheduled / draft posts that match the query `e2e picker`, a shortcode, and a
   site-scoped author for the forged-cookie case.

The seed script refuses to run against a non-local database.

## Specs

- `milkdown-editor-mounts-smoke.spec.ts` — login works, the fixture post opens and the
  Milkdown editor mounts with the stored Markdown.
- `editor-pickers.spec.ts` — `@` link picker (site scoping, live-only results, forged
  `payload-tenant` cookie) and `/snippet` + REST render of shortcodes.

Both `deviceScaleFactor` projects run: `chromium-dpr1` and `chromium-dpr2`.

## Notes

- **The server is never reused** (`reuseExistingServer: false`): a reused, uninstrumented
  server would not expose `window.__milkdownE2E`. To use your own server it MUST be
  instrumented:

  ```bash
  NEXT_PUBLIC_E2E=1 pnpm dev -p 3101     # separate terminal
  PW_SKIP_WEB_SERVER=1 pnpm test:e2e
  ```

- If a previous aborted run left `next dev` alive on 3101 the next run aborts with
  `http://localhost:3101/admin/login is already used`:
  `ss -ltnp | grep ':3101'` then `pkill -f "next dev -p 3101"`.
- Re-seed manually (rarely needed): `node --env-file=.env --import tsx src/scripts/seed-e2e-admin.ts`.
- `readEditorMarkdown()` returns the debounced serialization; poll it
  (`expect.poll(...)`) or read `readDocJSON(page)` for the live document.

## Files

- `../playwright.config.ts` — projects, dedicated 3101 instrumented webServer, globalSetup.
- `global-setup.ts` — seeds the admin + fixtures, then preflights the editor hook.
- `utils/login-as-e2e-admin.ts` — logs into `/admin/login` as the seeded user.
- `utils/editor-fixture.ts` — fixture lookup by slug, opened editor, the
  `window.__milkdownE2E` preflight, and doc-JSON/markdown readers.
