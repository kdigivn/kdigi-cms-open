# Upgrading

How to move a KDIGI CMS install to a newer version, how database migrations work, and how to write one if you extend the schema.

## How schema changes work

- The database schema is **never synchronised automatically** (`push: false` in `src/payload.config.ts`). Every schema change ships as a timestamped migration in [`src/migrations/`](../src/migrations), registered in `src/migrations/index.ts`.
- Version 1.0.0 starts from a single baseline migration (`20261103_042515_initial`) that creates the whole schema on an empty database. Later releases add new files after it; you never edit applied migrations.
- Applied migrations are recorded in the `payload_migrations` table, so running the command again is a no-op when nothing is pending.
- Versions follow [SemVer](https://semver.org/). The [CHANGELOG](../CHANGELOG.md) lists schema changes, new environment variables and breaking API changes for each release.

## Upgrade procedure

1. **Read the [CHANGELOG](../CHANGELOG.md)** for every version between yours and the target. Look for "Breaking", new required variables and anything that touches [REST API](rest-api.md) responses your frontends rely on.
2. **Back up** the database and the media volume ([deploy → backups](deploy.md#backups)). Do not skip this: rolling a schema back is done by restoring the backup.
3. **Get the new code**: `git pull` (or `git fetch --tags && git checkout vX.Y.Z`) and rebuild.
   - Docker Compose: `docker compose up -d --build` — the entrypoint runs `payload migrate` before starting the server.
   - Coolify: redeploy.
   - Without Docker: `pnpm install --frozen-lockfile && pnpm build && pnpm migrate && pnpm start`.
4. **Verify**: log in to `/admin`, open a few documents in each collection, upload an image, and request a public URL from your frontend. `GET /api/health` only proves the process is up, not that the schema is current.
5. Update `.env`/container variables if the changelog added any ([configuration](configuration.md)).

### Running migrations yourself

| Where | Command |
| --- | --- |
| Local checkout | `pnpm migrate` (equivalent to `pnpm payload migrate`) |
| Status | `pnpm payload migrate:status` |
| Running container | `docker compose exec app node_modules/.bin/payload migrate` |
| As a separate release step | set `SKIP_MIGRATIONS=true` on the app container and run the command above before routing traffic to the new version |

Migrations run with the database connection of `DATABASE_URI`; make sure the CLI can reach it from where you run it (inside the Compose network use host `db`).

### Zero-downtime notes

Migrations that only add tables, columns or enum values are safe to apply while the previous version still serves traffic; the changelog flags the ones that are not. Because the repository does not orchestrate rolling deploys, plan a short maintenance window for upgrades that the changelog marks as breaking, and upgrade the CMS before the frontends that consume new fields.

### Rolling back

Redeploy the previous image only if it can read the migrated schema (additive migrations usually allow it). Otherwise restore the database backup taken in step 2 — you lose content written after the backup. Avoid `pnpm migrate:down` on a production database: it reverses the latest **batch**, which may contain more than the one migration you have in mind. Use it on scratch databases to test `down()` functions.

## Moving between environments

- **Upgrading Node.js/pnpm:** the image uses Node 22; `package.json` requires Node ≥ 20.9 and pins `packageManager`. Use `corepack enable` to get the right pnpm.
- **Changing `PAYLOAD_SECRET`** logs everyone out and invalidates API keys; it does not affect stored content.
- **Changing `PAYLOAD_PUBLIC_SERVER_URL`** changes the admin origin and the prefix of local media URLs; update frontends that cache absolute media URLs.
- **Local disk → R2:** see [media and storage](media-storage.md#migrating-from-local-disk-to-r2) (manual procedure; no built-in command).

## Writing a migration (forks and contributors)

1. Change collections/fields in `src/`.
2. `pnpm payload migrate:create <short-name>` generates a migration plus a schema snapshot (`.json`). It may ask interactive questions about renames; **read the generated SQL** and delete anything unrelated to your change.
3. Make it safe: `CREATE TYPE` is not idempotent — guard it (`DO $$ … EXCEPTION WHEN duplicate_object …`) or check the catalog; use `IF NOT EXISTS`/`IF EXISTS` for tables, columns and indexes; adding enum labels uses `ALTER TYPE … ADD VALUE IF NOT EXISTS`.
4. Provide a working `down()`. Test both directions on a scratch database: `pnpm migrate`, `pnpm migrate:down`, `pnpm migrate`.
5. **New collection?** Make sure the migration also adds its foreign-key column to `payload_locked_documents_rels`, or every admin page fails with a 500. Generated migrations include it; hand-written ones often forget.
6. Adding a new `Sites.theme` value, or any other `select` option, needs a migration that adds the enum label, otherwise saving a document with the new value fails.
7. A new background-job task slug needs its label added to `enum_payload_jobs_task_slug` and `enum_payload_jobs_log_task_slug`.
8. Run `pnpm generate:types` (updates `src/payload-types.ts`) and, for new admin components, `pnpm generate:importmap`.
9. Run `pnpm payload migrate` against an empty database and against a copy of real data before releasing. CI also applies the migration chain to an empty PostgreSQL and runs the integration tests.

More on conventions: [CONTRIBUTING](../CONTRIBUTING.md), [architecture](architecture.md).
