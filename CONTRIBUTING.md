# Contributing to KDIGI CMS

Thanks for helping! KDIGI CMS is an MIT-licensed headless multi-site CMS built on Payload 3, Next.js 15 and PostgreSQL. Bug reports, docs fixes, translations and code are all welcome. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug / request a feature:** open an [issue](https://github.com/kdigivn/kdigi-cms-open/issues/new/choose). Search first.
- **Security issue:** do **not** open an issue — see [SECURITY.md](SECURITY.md).
- **Improve docs:** everything under [`docs/`](docs/README.md) and the READMEs.
- **Send code:** fork, branch, pull request (below). For large changes, open an issue first so we can agree on the approach.

## Development setup

Requirements: Node.js ≥ 20.9 (22 recommended), pnpm 10 (`corepack enable`), Docker (for PostgreSQL).

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
pnpm install --frozen-lockfile
cp .env.example .env        # then edit: see docs/configuration.md
docker compose up -d db     # PostgreSQL only, on localhost:5432
pnpm migrate               # apply migrations (schema is never auto-synced)
pnpm dev                    # http://localhost:3000/admin
```

Full walkthrough: [docs/getting-started.md](docs/getting-started.md). Architecture overview: [docs/architecture.md](docs/architecture.md).

## Before you open a pull request

Run all of these; CI runs them too:

```bash
pnpm typecheck
pnpm lint
pnpm test                  # unit tests (node:test + tsx, colocated *.test.ts)
pnpm test:integration      # needs a Postgres DATABASE_URI and PAYLOAD_INTEGRATION=1
```

> `next build` deliberately skips lint and typecheck, so a green build proves nothing — always run `pnpm typecheck` and `pnpm lint` yourself.

If you changed the schema (collections/fields):

1. `pnpm payload migrate:create <short-name>` and review/edit the generated SQL migration in `src/migrations/`.
2. `pnpm generate:types` (updates `src/payload-types.ts`).
3. `pnpm generate:importmap` if you added/renamed admin components.
4. Migrations must be reversible, and must not assume an empty database. `CREATE TYPE` is **not** idempotent — guard it. A new collection needs its foreign-key column in `payload_locked_documents_rels` or the admin returns 500 (generated migrations include it; hand-written ones often forget). See [docs/upgrading.md](docs/upgrading.md).

If you changed the public REST contract, update [docs/rest-api.md](docs/rest-api.md) in the same PR, plus the agent skill `skills/kcms-frontend/` (especially `references/contract.md`), then run `pnpm generate:llms` — `pnpm test` fails while `public/llms.txt` / `public/llms-full.txt` are stale.

## Code conventions

- TypeScript, kebab-case descriptive file names, tests colocated as `*.test.ts` using `node:test`.
- Access control is the security boundary: every collection has explicit `access.*` predicates (see [roles and permissions](docs/roles-and-permissions.md)). Do not rely on the multi-tenant plugin's admin filters alone.
- Content collections are versioned: hooks must **not** re-save their own document with `payload.update()`. Derive values in `beforeChange` or write scalar columns directly. Preserve the existing recursion-guard context flags when editing hooks.
- Never log or return secrets (per-site storage credentials, API keys). Anything using `overrideAccess` must be reviewed for field-level leaks.
- Vietnamese (`vi`) is the default locale with English (`en`) fallback; keep bilingual labels on admin fields.
- Tailwind/shadcn utilities only inside `.twp` wrappers in the admin — never on bare Payload elements ([admin theming](docs/admin-theming.md)).
- No secrets, real customer data or real domains in code, fixtures or docs. Use `example.com` / `change-me`.

## Commit and PR guidelines

- Branch from `main`; one logical change per PR; keep PRs small enough to review.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Fill in the pull request template; link the issue; add tests for behavior changes; update docs and [CHANGELOG.md](CHANGELOG.md) (under "Unreleased") for user-visible changes.
- By submitting a contribution you agree it is licensed under the project's [MIT License](LICENSE).

## Using AI coding agents

[`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) contain repository guidance for AI assistants (commands, gotchas). You are welcome to use them; you remain responsible for what you submit.
