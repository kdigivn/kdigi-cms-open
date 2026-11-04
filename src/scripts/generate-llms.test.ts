import assert from 'node:assert/strict'
import test from 'node:test'

import { absolutizeLinks, buildLlms, githubBlobBase, LLMS_OUTPUTS, readRepoFile } from './generate-llms'

const BASE = 'https://github.com/example/repo/blob/main/'

test('committed llms files match the generator (run `pnpm generate:llms` after editing the skill or docs)', () => {
  const expected = buildLlms(readRepoFile)
  for (const key of ['index', 'full'] as const) {
    assert.ok(
      readRepoFile(LLMS_OUTPUTS[key]).replace(/\r\n/g, '\n') === expected[key],
      `${LLMS_OUTPUTS[key]} is stale — run: pnpm generate:llms`,
    )
  }
})

test('relative links resolve against the source file directory; absolute, root and anchor links stay', () => {
  const md = '[a](architecture.md#jobs) [b](../README.md) [c](https://example.com/x) [d](#seo) [e](/llms-full.txt)'
  assert.equal(
    absolutizeLinks(md, 'docs/rest-api.md', BASE),
    `[a](${BASE}docs/architecture.md#jobs) [b](${BASE}README.md) [c](https://example.com/x) [d](#seo) [e](/llms-full.txt)`,
  )
  assert.equal(absolutizeLinks('[r](references/contract.md)', 'skills/kcms-frontend/SKILL.md', BASE), `[r](${BASE}skills/kcms-frontend/references/contract.md)`)
})

test('githubBlobBase accepts npm-style git urls and rejects non-GitHub ones', () => {
  assert.equal(githubBlobBase('git+https://github.com/example/repo.git'), BASE)
  assert.throws(() => githubBlobBase('https://gitlab.example.com/a/b.git'))
})

test('skill frontmatter is stripped from the full file', () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ repository: { url: 'git+https://github.com/example/repo.git' } }),
    'skills/kcms-frontend/SKILL.md': '---\r\nname: kcms-frontend\r\ndescription: x\r\n---\r\n\r\n# Skill\r\n',
    'skills/kcms-frontend/references/contract.md': '# Contract',
    'docs/rest-api.md': '# REST',
    'docs/seo.md': '# SEO',
  }
  const { full } = buildLlms((p) => files[p] ?? assert.fail(`unexpected read ${p}`))
  assert.doesNotMatch(full, /name: kcms-frontend/)
  assert.match(full, /<!-- source: https:\/\/github\.com\/example\/repo\/blob\/main\/skills\/kcms-frontend\/SKILL\.md -->\n\n# Skill\n/)
})
