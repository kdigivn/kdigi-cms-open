/**
 * Unit tests for the local-disk media storage helpers.
 * Runner: node --import tsx --test src/lib/storage/local-media.test.ts
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  SHARED_TENANT_KEY,
  deleteLocalMedia,
  isLocalMediaUrl,
  readLocalMediaStat,
  resolveLocalMediaPath,
  serveLocalMedia,
  toLocalDiskName,
  toLocalTenantKey,
  writeLocalMedia,
} from './local-media'

let dir: string
let previous: string | undefined

before(async () => {
  previous = process.env.MEDIA_DIR
  dir = await mkdtemp(path.join(os.tmpdir(), 'kdigi-media-'))
  process.env.MEDIA_DIR = dir
})

after(async () => {
  if (previous === undefined) delete process.env.MEDIA_DIR
  else process.env.MEDIA_DIR = previous
  await rm(dir, { recursive: true, force: true })
})

describe('toLocalTenantKey', () => {
  it('accepts ids and relationship objects, falls back to shared', () => {
    assert.equal(toLocalTenantKey(7), '7')
    assert.equal(toLocalTenantKey('abc-1'), 'abc-1')
    assert.equal(toLocalTenantKey({ id: 12 }), '12')
    assert.equal(toLocalTenantKey(undefined), SHARED_TENANT_KEY)
    assert.equal(toLocalTenantKey(null), SHARED_TENANT_KEY)
    assert.equal(toLocalTenantKey('../etc'), SHARED_TENANT_KEY)
    assert.equal(toLocalTenantKey({}), SHARED_TENANT_KEY)
  })
})

describe('toLocalDiskName', () => {
  it('keeps plain names verbatim', () => {
    assert.equal(toLocalDiskName('photo-1.webp'), 'photo-1.webp')
  })

  it('makes odd names safe and collision-free', () => {
    const spaced = toLocalDiskName('Vé Tàu 1.png')
    assert.match(spaced, /^V__T_u_1-[0-9a-f]{8}\.png$/)
    assert.notEqual(toLocalDiskName('a b.png'), toLocalDiskName('a_b.png'))
    assert.equal(toLocalDiskName('a_b.png'), 'a_b.png')
  })

  it('never yields traversal, separators or dotfiles', () => {
    for (const evil of ['../../etc/passwd', '..\\x.png', '.htaccess', 'a/../b.png', '....']) {
      const name = toLocalDiskName(evil)
      assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, evil)
      assert.ok(!name.includes('..'), evil)
    }
  })
})

describe('resolveLocalMediaPath', () => {
  it('stays inside MEDIA_DIR and rejects bad tenant keys', () => {
    assert.equal(resolveLocalMediaPath('3', 'a.png'), path.join(dir, '3', 'a.png'))
    assert.equal(resolveLocalMediaPath('..', 'a.png'), undefined)
    assert.equal(resolveLocalMediaPath('a/b', 'a.png'), undefined)
    const hostile = resolveLocalMediaPath('3', '../../x.png')
    assert.ok(hostile?.startsWith(path.join(dir, '3') + path.sep))
  })
})

describe('isLocalMediaUrl', () => {
  it('matches Payload file-route urls only', () => {
    assert.equal(isLocalMediaUrl('/api/media/file/a.png'), true)
    assert.equal(isLocalMediaUrl('http://localhost:3000/api/media/file/a%20b.png?v=2'), true)
    assert.equal(isLocalMediaUrl('https://cdn.example.net/media/2/a.png'), false)
    assert.equal(isLocalMediaUrl('media/2/a.png'), false)
    assert.equal(isLocalMediaUrl(undefined), false)
  })
})

describe('write / serve / delete', () => {
  it('stores a file, serves it with headers + 304, then deletes it', async () => {
    await writeLocalMedia('9', 'Pic One.png', Buffer.from('png-bytes'))
    assert.ok(await readLocalMediaStat('9', 'Pic One.png'))
    assert.equal(await readLocalMediaStat('8', 'Pic One.png'), undefined)

    const res = await serveLocalMedia({ headers: new Headers() }, '9', 'Pic One.png')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'png-bytes')

    const etag = res.headers.get('etag')!
    const cached = await serveLocalMedia(
      { headers: new Headers({ 'if-none-match': etag }) },
      '9',
      'Pic One.png',
    )
    assert.equal(cached.status, 304)

    await deleteLocalMedia('9', 'Pic One.png')
    assert.equal(await readLocalMediaStat('9', 'Pic One.png'), undefined)
    assert.equal((await serveLocalMedia({}, '9', 'Pic One.png')).status, 404)
  })

  it('serves unknown extensions as attachments and svg with a locked CSP', async () => {
    await writeLocalMedia('9', 'page.html', Buffer.from('<script>1</script>'))
    const html = await serveLocalMedia({}, '9', 'page.html')
    assert.equal(html.headers.get('content-type'), 'application/octet-stream')
    assert.match(html.headers.get('content-disposition') ?? '', /^attachment/)

    await writeLocalMedia('9', 'logo.svg', Buffer.from('<svg/>'))
    const svg = await serveLocalMedia({}, '9', 'logo.svg')
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
    assert.match(svg.headers.get('content-security-policy') ?? '', /sandbox/)
  })

  it('refuses a bad tenant key and contains hostile filenames inside the tenant dir', async () => {
    await assert.rejects(() => writeLocalMedia('../x', 'evil.png', Buffer.from('x')))
    await writeLocalMedia('9', '../../evil.png', Buffer.from('x'))
    assert.equal(await readLocalMediaStat('..', 'evil.png'), undefined)
    assert.ok(await readLocalMediaStat('9', '../../evil.png'))
  })
})
