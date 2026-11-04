---
phase: 3
title: "Multi-skill setup and bundling"
status: completed
priority: P2
dependencies: [1]
---

# Phase 3: Multi-skill setup and bundling

## Overview
`kcms setup <target> --with-skill [names]` installs `kcms`, `kcms-frontend`, or both; the npm package bundles both skills.

## Requirements
- Functional:
  - `--with-skill` with no value → `kcms` (unchanged behaviour). `--with-skill kcms-frontend` or `--with-skill kcms,kcms-frontend` → listed skills. Unknown name → usage error listing valid names.
  - Each skill copied to `<skills root>/<name>/` for the target/scope.
- Non-functional: one source of truth for skill names (`BUNDLED_SKILLS = ['kcms','kcms-frontend'] as const`).

## Architecture
- `setup-targets.ts`: `skillDir` (ends in `/kcms`) → `skillsRoot` (parent dir); join name at install time. Update all targets + `setup-targets.test.ts` expectations.
- `commands/setup.ts`: `.option('--with-skill [names]', …)`; commander yields `true` for bare flag → map to `['kcms']`; `bundledSkillDir(name)`.
- `packages/kcms-cli/scripts/bundle-skill.mjs`: copy every name in the list (keep list in sync; script is `.mjs` → duplicate the two-item array with a comment pointing at `setup-targets.ts`, or read `skills/*` filtered by `SKILL.md` presence — prefer the latter, no list to sync).
- `packages/kcms-cli/package.json` `files` must include bundled skills dir (verify).

## Related Code Files
- Modify: `packages/kcms-cli/src/setup-targets.ts`, `packages/kcms-cli/src/setup-targets.test.ts`, `packages/kcms-cli/src/commands/setup.ts`, `packages/kcms-cli/scripts/bundle-skill.mjs`, possibly `packages/kcms-cli/package.json`

## Implementation Steps
1. LSP references on `skillDir` before renaming.
2. Rename to `skillsRoot`, update targets and tests.
3. Parse option; validate names; loop copy; print `installed skill <name> → <dir>` each.
4. Update bundle script to copy all `skills/*/SKILL.md` dirs.
5. Test: name parsing (bare → `['kcms']`, list, unknown → error) as a pure helper `parseSkillNames` with a unit test.
6. `pnpm --filter @kdigi/kcms-cli build && cd packages/kcms-cli && npm pack --dry-run` → both skill folders listed.

## Success Criteria
- [x] Bare `--with-skill` behaves as before (test).
- [x] `--with-skill kcms,kcms-frontend` installs both in a temp project dir (manual run with `--scope project` in a tmp cwd).
- [x] `npm pack --dry-run` lists `skills/kcms/` and `skills/kcms-frontend/`.

## Risk Assessment
- Commander optional-value option swallowing the next positional → `<target>` precedes options in docs; test `kcms setup claude-code --with-skill --write` (bare flag followed by another flag) parses as bare.
