import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { isInsecureRemote, normalizeBaseUrl, readConfig, resolveConnection, writeConfig } from './config.js'

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
