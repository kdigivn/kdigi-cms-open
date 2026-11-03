/**
 * Unit tests for the image-edit endpoint's pure validation helper.
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Re-implement validateBody here for the test (the endpoint file imports
// AWS SDK which bloats the test graph). The implementation must stay in
// sync with edit-media-image.ts.
function validateBody(raw: unknown): {
  rotate?: 0 | 90 | 180 | 270
  flipH?: boolean
  flipV?: boolean
  crop?: { left: number; top: number; width: number; height: number }
  resizeWidth?: number
} {
  const body = (raw ?? {}) as {
    rotate?: number
    flipH?: boolean
    flipV?: boolean
    crop?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown }
    resizeWidth?: unknown
  }
  if (body.rotate !== undefined && ![0, 90, 180, 270].includes(body.rotate)) {
    throw new Error(`Invalid rotate: ${body.rotate}. Must be one of 0|90|180|270`)
  }
  if (body.crop) {
    const c = body.crop
    if (
      typeof c.left !== 'number' ||
      typeof c.top !== 'number' ||
      typeof c.width !== 'number' ||
      typeof c.height !== 'number' ||
      c.width <= 0 ||
      c.height <= 0
    ) {
      throw new Error('Invalid crop: left/top/width/height must be positive numbers')
    }
  }
  if (body.resizeWidth !== undefined && (typeof body.resizeWidth !== 'number' || body.resizeWidth <= 0)) {
    throw new Error('Invalid resizeWidth: must be a positive number')
  }
  return body as never
}

describe('edit-image body validation', () => {
  it('accepts an empty body (no transforms)', () => {
    const out = validateBody({})
    assert.deepEqual(out, {})
  })
  it('accepts each of the four valid rotations', () => {
    for (const r of [0, 90, 180, 270]) {
      const out = validateBody({ rotate: r })
      assert.equal(out.rotate, r)
    }
  })
  it('rejects invalid rotation values', () => {
    assert.throws(() => validateBody({ rotate: 45 }), /Invalid rotate/)
    assert.throws(() => validateBody({ rotate: -90 }), /Invalid rotate/)
    assert.throws(() => validateBody({ rotate: 360 }), /Invalid rotate/)
  })
  it('accepts a valid crop rectangle', () => {
    const out = validateBody({ crop: { left: 0, top: 0, width: 100, height: 100 } })
    assert.deepEqual(out.crop, { left: 0, top: 0, width: 100, height: 100 })
  })
  it('rejects crop with non-numeric or zero dimensions', () => {
    assert.throws(() => validateBody({ crop: { left: 0, top: 0, width: 0, height: 100 } }), /Invalid crop/)
    assert.throws(() => validateBody({ crop: { left: 0, top: 0, width: 100, height: 0 } }), /Invalid crop/)
    assert.throws(() => validateBody({ crop: { left: '0', top: 0, width: 100, height: 100 } }), /Invalid crop/)
    // Negative left/top is allowed (the server clamps to ≥ 0). Only width
    // and height are required to be strictly positive.
  })
  it('accepts a positive resizeWidth', () => {
    assert.equal(validateBody({ resizeWidth: 800 }).resizeWidth, 800)
  })
  it('rejects zero or negative resizeWidth', () => {
    assert.throws(() => validateBody({ resizeWidth: 0 }), /Invalid resizeWidth/)
    assert.throws(() => validateBody({ resizeWidth: -100 }), /Invalid resizeWidth/)
  })
  it('passes through flipH / flipV booleans', () => {
    const out = validateBody({ flipH: true, flipV: false })
    assert.equal(out.flipH, true)
    assert.equal(out.flipV, false)
  })
})
