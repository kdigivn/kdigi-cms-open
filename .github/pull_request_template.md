## Summary

<!-- What does this PR change and why? Link the issue: Fixes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Docs only
- [ ] Refactor / chore
- [ ] Breaking change (REST contract, schema or env var)

## Checklist

- [ ] `pnpm typecheck` and `pnpm lint` pass (`next build` skips both)
- [ ] `pnpm test` passes; tests added/updated for behavior changes
- [ ] Schema change: migration added (reversible, no empty-DB assumption), `pnpm generate:types` run, `pnpm generate:importmap` if admin components changed
- [ ] Docs updated (`docs/`, README, `.env.example`) and `CHANGELOG.md` under "Unreleased"
- [ ] No secrets, real customer data or real domains in code, fixtures or docs
- [ ] I agree my contribution is licensed under the MIT License
