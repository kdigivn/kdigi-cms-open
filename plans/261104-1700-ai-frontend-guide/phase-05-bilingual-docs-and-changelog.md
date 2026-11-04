---
phase: 5
title: "Bilingual docs and changelog"
status: completed
priority: P2
dependencies: [2, 3, 4]
---

# Phase 5: Bilingual docs and changelog

## Overview
Human guide for vibe coders: how to point an AI at KDIGI CMS and get a correct site, in Vietnamese and English.

## Requirements
- `docs/frontend-with-ai.md`: two halves (`## Tiếng Việt`, `## English`) or two files `frontend-with-ai.md` + `frontend-with-ai.vi.md` — follow existing repo convention (`README.md` VI + `README.en.md` EN → use `docs/frontend-with-ai.md` EN + `docs/frontend-with-ai.vi.md` VI, cross-linked).
- Content:
  1. Mental model: site reads REST anonymously; MCP/CLI only for the AI at dev time; key never in site code.
  2. 3 steps: install CLI + `kcms setup <tool> --write --with-skill kcms,kcms-frontend`; `kcms frontend context --site <key>`; prompt.
  3. Prompt templates per framework (Next.js, Astro, SvelteKit, Nuxt, Angular/React SPA) + follow-ups ("add English", "add comments", "add search").
  4. Without CLI: give the agent `<cms>/llms.txt`.
  5. Common AI mistakes table (symptom → cause → fix): drafts visible, wrong site data, stale pages, broken "View on site", Markdown shown raw, missing SEO.
  6. Deploy checklist: domain in `Sites.domain`, webhook reachable over https, `ENABLE_JOBS_AUTORUN=true` on one CMS instance.
- Updates: `README.md` + `README.en.md` (one line + link), `docs/README.md` index, `docs/ai-integration.md` (section "Building a frontend with AI" → link), `docs/rest-api.md` (intro link to guide + llms), `packages/kcms-cli/README.md` (`frontend context`, `--with-skill [names]`), `CONTRIBUTING.md` (contract change ⇒ update `skills/kcms-frontend` + `pnpm generate:llms`), `CHANGELOG.md` Unreleased.

## Related Code Files
- Create: `docs/frontend-with-ai.md`, `docs/frontend-with-ai.vi.md`
- Modify: files listed above
- After edits: `pnpm generate:llms` (llms index links the guide)

## Implementation Steps
1. Write EN guide; translate to VI (natural Vietnamese, keep commands/code identical).
2. Apply updates; regenerate llms.
3. Check every relative link resolves (`read` each target).

## Success Criteria
- [x] Both guides cross-linked, commands identical, use `example.com`/`change-me`.
- [x] CHANGELOG Unreleased lists skill, CLI command, `--with-skill [names]`, llms files.
- [x] `pnpm test` (llms drift) green after regeneration.

## Risk Assessment
- Prompt templates go stale with skill wording → templates reference "skill kcms-frontend and KCMS.md", not specific rules.
