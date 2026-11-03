import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import sharp from 'sharp'

import { MediaImportError, sniffImageMime } from './import-media-from-url'

const canvas = () => sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } })

describe('sniffImageMime', () => {
  it('accepts AVIF, which sharp reports as format "heif" with av1 compression', async () => {
    assert.equal(await sniffImageMime(await canvas().avif().toBuffer()), 'image/avif')
  })

  it('takes the type from the bytes, not from a file name or header', async () => {
    assert.equal(await sniffImageMime(await canvas().webp().toBuffer()), 'image/webp')
    assert.equal(await sniffImageMime(await canvas().png().toBuffer()), 'image/png')
  })

  it('rejects SVG (scriptable) and non-images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script></svg>')
    await assert.rejects(sniffImageMime(svg), MediaImportError)
    await assert.rejects(sniffImageMime(Buffer.from('<!doctype html><title>x</title>')), MediaImportError)
  })
})
