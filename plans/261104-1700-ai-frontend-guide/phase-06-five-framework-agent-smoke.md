---
phase: 6
title: "Five-framework agent smoke (6 runs)"
status: completed
priority: P1
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Five-framework agent smoke (6 runs)

## Overview
Prove the deliverable: a fresh AI coding agent, empty directory, only the installed skill + `KCMS.md` + one prompt, builds a correct site in each framework. Failures feed fixes back into phases 1–2.

## Requirements
- Frameworks (6 runs): Next.js App Router, Astro, SvelteKit, Nuxt, React + Vite prerender, Angular SSR. <!-- Updated: Validation Session 1 - both SPA variants -->
- Same CMS: local `pnpm dev` + `pnpm migrate` + `pnpm seed:demo` with the **extended seed** (step 0): 3 published posts, 1 draft post, pages incl. home, `PRIMARY` menu, `pageGroup` FRONT_PAGE/ABOUT/CONTACT, `en` translations. Seed site `domain` is `localhost`.
- Prompt (identical except framework): `Build a <framework> website for the KDIGI CMS site <siteKey>. Follow the kcms-frontend skill and KCMS.md.`
- Agent: **Claude Code** headless (`claude -p`), with `kcms setup claude-code --write --with-skill kcms,kcms-frontend` + MCP using an **editor** key, in a temp dir outside the repo. <!-- Updated: Validation Session 1 - agent = Claude Code -->

## Checks per framework (record pass/fail + evidence)
1. Home renders `FRONT_PAGE` content; nav renders `PRIMARY` menu.
2. Published post page at `/{slug}` renders HTML (no raw Markdown); draft slug → 404.
3. `<title>`/meta description/OG from `seo`; JSON-LD `<script type="application/ld+json">` equals `seo.jsonLd.raw`.
4. Generated code contains no `Authorization`, no API key, no `/api/mcp` (grep).
5. `curl -X POST /api/cms/revalidate -d '{"collection":"posts","id":"1","slug":"<slug>"}'` → 2xx; edit post title in admin → page shows new title without restart (React prerender: after rebuild; Angular SSR: on next request — record mechanism).
6. English route shows `en` content where translated; `lang` attribute correct.
7. Route parity: for each published post/page/landing, the **path** from `publicPathFor(collection, slug)` (call `/api/frontend-doc-url` with an admin session cookie, not the API key, and take only the path) returns 200 on that run's frontend port. Parallel runs share one CMS whose `FRONTEND_BASE_URL`/domain can target only one port, so the full URL is not opened. Alternative pass: agent chose different routes and told the user to change `publicPathFor`. <!-- Updated: Review 1 - path-only check for parallel runs -->
8. Agent did not publish/trash anything (check `agent-op` log lines in CMS output).

## Architecture
- Run the 6 sessions in parallel (subagents), each in its own temp dir and port; shared CMS on :3000. Frontend dev servers on distinct ports; for webhook check, call the frontend directly (the job targets `https://{Sites.domain}` = `https://localhost`, not the frontend dev port) and record job log evidence separately.
- Report: `plans/261104-1700-ai-frontend-guide/reports/smoke-report.md` — table framework × check, agent/model/version, framework version, fixes applied.

## Related Code Files
- Create: `reports/smoke-report.md`
- Modify: `src/seed/seed-demo.ts` (step 0), `CHANGELOG.md`, `docs/getting-started.md` (if it lists seed contents)
- Modify (only on failure): `skills/kcms-frontend/**`, `packages/kcms-cli/src/frontend-context.ts`, docs; then regenerate llms.

## Implementation Steps
0. **Extend `src/seed/seed-demo.ts`** (idempotent, same lookup-first style): page `trang-chu` (vi "Trang chủ" / en "Home"); 1 draft post (`status: 'draft'`, vi + en); `Sites.pageGroup` = FRONT_PAGE→`trang-chu`, ABOUT→`gioi-thieu`, CONTACT→`lien-he`. `ensureSite` returns early for an existing site (`seed-demo.ts:303-306`) and `demo:reset` keeps the Sites row, so backfill in the **existing-site branch**: add each missing key, never overwrite a key the user already set. Update the header comment and `docs/getting-started.md` if it lists seed contents; CHANGELOG Unreleased line. Verify: fresh DB, existing DB and after `pnpm demo:reset` all end with the 3 keys; second `pnpm seed:demo` changes nothing. <!-- Updated: Validation Session 1 - extend seed; Review 1 - backfill existing site -->
1. Prepare CMS + demo data + editor key (env var, never in files).
2. Build CLI from source; run setup + context in each temp dir.
3. Launch 6 Claude Code sessions with the prompt; no extra guidance.
4. Run checks 1–8; capture evidence (curl output, screenshots for 1–3, grep output for 4).
5. Failure → classify (skill gap / context gap / framework quirk) → fix skill/context → rerun that framework from scratch.
6. Write report; delete temp dirs.

## Success Criteria
- [x] 6/6 runs pass checks 1–8 (check 5 records mechanism; check 7 passes via matching routes or explicit publicPathFor note).
- [x] `pnpm seed:demo` re-run is a no-op; fresh seed has draft post + pageGroup.
- [x] Each fix made is reflected in skill/references and llms regenerated (smoke needed no fixes; post-review reference fixes applied after the runs).
- [x] `pnpm lint && pnpm typecheck && pnpm test` green at the end.

## Risk Assessment
- Agent nondeterminism → a pass needs one clean run from scratch after the last skill change; a fail that reproduces twice is a skill bug.
- Cost/time of 6 parallel agent runs → acceptable per user decision.
- Webhook can't reach localhost from CMS job → manual call + job log evidence, stated in report.
