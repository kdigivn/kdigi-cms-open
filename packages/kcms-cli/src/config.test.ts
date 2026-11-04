import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { isInsecureRemote, normalizeBaseUrl, readConfig, resolveBaseUrlAndSite, resolveConnection, writeConfig } from './config.js'
import { CliError } from './errors.js'

const config = {
  default: 'work',
  profiles: {
    work: { url: 'https://cms.example.com', apiKey: 'profile-key', site: 'main' },
    other: { url: 'https://other.example.com', apiKey: 'other-key' },
  },
}

describe('resolveConnection', () => {
  it('uses the default profile when nothing else is given', () => {
    assert.deepEqual(resolveConnection({}, {}, config), { url: 'https://cms.example.com', apiKey: 'profile-key', site: 'main', profile: 'work' })
  })

  it('lets flags beat env and env beat the profile', () => {
    const env = { KCMS_URL: 'https://env.example.com', KCMS_API_KEY: 'env-key', KCMS_SITE: 'env-site' }
    assert.deepEqual(resolveConnection({ url: 'https://flag.example.com/api/mcp', site: 'flag-site' }, env, config), {
      url: 'https://flag.example.com',
      apiKey: 'env-key',
      site: 'flag-site',
      profile: 'work',
    })
  })

  it('fails with a login hint when no key is available', () => {
    assert.throws(() => resolveConnection({}, {}, { profiles: {} }), /kcms login/)
    assert.throws(() => resolveConnection({ profile: 'missing' }, {}, config), /does not exist/)
  })
})

describe('resolveBaseUrlAndSite', () => {
  it('resolves url, site and profile without any API key', () => {
    const keyless = { default: 'local', profiles: { local: { url: 'http://localhost:3000', site: 'demo' } } }
    assert.deepEqual(resolveBaseUrlAndSite({}, {}, keyless), { url: 'http://localhost:3000', site: 'demo', profile: 'local' })
  })

  it('keeps the flag > env > profile precedence and normalizes the URL', () => {
    assert.deepEqual(resolveBaseUrlAndSite({ url: 'https://flag.example.com/admin/', site: 'flag-site' }, { KCMS_URL: 'https://env.example.com', KCMS_SITE: 'env-site' }, config), {
      url: 'https://flag.example.com',
      site: 'flag-site',
      profile: 'work',
    })
    assert.deepEqual(resolveBaseUrlAndSite({}, { KCMS_SITE: 'env-site' }, { profiles: { p: { url: 'https://p.example.com' } }, default: 'p' }), {
      url: 'https://p.example.com',
      site: 'env-site',
      profile: 'p',
    })
  })

  it('fails as a usage error when no URL is configured and rejects unknown profiles', () => {
    assert.throws(
      () => resolveBaseUrlAndSite({}, {}, { profiles: {} }),
      (err: unknown) => err instanceof CliError && err.exitCode === 2 && /No CMS URL/.test(err.message),
    )
    assert.throws(() => resolveBaseUrlAndSite({ profile: 'missing' }, {}, config), /does not exist/)
  })
})

describe('config file', () => {
  it('is written with mode 600', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'kcms-')), 'nested', 'config.json')
    writeConfig(config, path)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.deepEqual(readConfig(path), config)
  })
})

describe('url helpers', () => {
  it('normalizes pasted admin/MCP URLs to the base URL', () => {
    assert.equal(normalizeBaseUrl('https://cms.example.com/admin/'), 'https://cms.example.com')
    assert.equal(normalizeBaseUrl('https://example.com/cms/api/mcp'), 'https://example.com/cms')
  })

  it('flags plain http only for non-local hosts', () => {
    assert.equal(isInsecureRemote('http://localhost:3000'), false)
    assert.equal(isInsecureRemote('http://cms.example.com'), true)
    assert.equal(isInsecureRemote('https://cms.example.com'), false)
  })
})
