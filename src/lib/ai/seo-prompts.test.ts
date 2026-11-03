/**
 * Unit tests for seo-prompts.ts — verifies per-field prompt builders produce
 * correct structure, length targets, Vietnamese locale instruction, and
 * JSON schema hints for chatJson.
 *
 * Runner: node --import tsx --test "src/lib/ai/seo-prompts.test.ts"
 * No network traffic. Pure function tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTitlePrompt,
  buildDescriptionPrompt,
  buildFaqPrompt,
  buildAltPrompt,
  SEO_FIELD_SCHEMAS,
} from './seo-prompts'

// ─── Shared context ────────────────────────────────────────────────────────────

const BASE_CTX = {
  docTitle: 'Vé sản phẩm cao tốc Cần Thơ – Phú Quốc',
  docContent: 'Đặt vé tàu cao tốc từ Cần Thơ đi Phú Quốc chỉ 350.000 VNĐ, khởi hành 8 giờ sáng mỗi ngày.',
  focusKeyword: 'tàu cao tốc Cần Thơ Phú Quốc',
}

// ─── Title prompt ─────────────────────────────────────────────────────────────

describe('buildTitlePrompt', () => {
  it('returns messages array with user role', () => {
    const msgs = buildTitlePrompt(BASE_CTX)
    assert.ok(Array.isArray(msgs), 'should be an array')
    assert.ok(msgs.length >= 1, 'should have at least one message')
    const last = msgs[msgs.length - 1]
    assert.equal(last.role, 'user')
  })

  it('includes doc title and focus keyword in prompt', () => {
    const msgs = buildTitlePrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes(BASE_CTX.docTitle), 'should include doc title')
    assert.ok(text.includes(BASE_CTX.focusKeyword), 'should include focus keyword')
  })

  it('specifies 40-65 character length target', () => {
    const msgs = buildTitlePrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('40') && text.includes('65'), 'should mention 40-65 char range')
  })

  it('specifies Vietnamese language', () => {
    const msgs = buildTitlePrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    const lc = text.toLowerCase()
    assert.ok(
      lc.includes('tiếng việt') || lc.includes('vietnamese') || lc.includes('việt'),
      'should specify Vietnamese language',
    )
  })
})

// ─── Description prompt ───────────────────────────────────────────────────────

describe('buildDescriptionPrompt', () => {
  it('returns messages array with user role', () => {
    const msgs = buildDescriptionPrompt(BASE_CTX)
    assert.ok(Array.isArray(msgs))
    const last = msgs[msgs.length - 1]
    assert.equal(last.role, 'user')
  })

  it('includes doc title and content in prompt', () => {
    const msgs = buildDescriptionPrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes(BASE_CTX.docTitle))
    assert.ok(text.includes(BASE_CTX.focusKeyword))
  })

  it('specifies 100-165 character length target', () => {
    const msgs = buildDescriptionPrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('100') && text.includes('165'), 'should mention 100-165 char range')
  })
})

// ─── FAQ prompt ───────────────────────────────────────────────────────────────

describe('buildFaqPrompt', () => {
  it('returns messages array', () => {
    const msgs = buildFaqPrompt({ ...BASE_CTX, count: 3 })
    assert.ok(Array.isArray(msgs))
    assert.ok(msgs.length >= 1)
  })

  it('includes requested count in prompt', () => {
    const msgs = buildFaqPrompt({ ...BASE_CTX, count: 5 })
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('5'), 'should mention count=5')
  })

  it('specifies JSON array schema for items', () => {
    const msgs = buildFaqPrompt({ ...BASE_CTX, count: 3 })
    const text = msgs.map(m => m.content).join('\n')
    const lc = text.toLowerCase()
    assert.ok(
      lc.includes('question') && lc.includes('answer'),
      'should specify question+answer fields',
    )
  })

  it('defaults count to 3 when not provided', () => {
    const msgs = buildFaqPrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('3'), 'default count 3 should appear in prompt')
  })
})

// ─── Alt text prompt ──────────────────────────────────────────────────────────

describe('buildAltPrompt', () => {
  it('returns messages array', () => {
    const msgs = buildAltPrompt({ ...BASE_CTX, imageContext: 'Tàu cao tốc trên sông Hậu' })
    assert.ok(Array.isArray(msgs))
  })

  it('includes image context when provided', () => {
    const msgs = buildAltPrompt({ ...BASE_CTX, imageContext: 'Tàu cao tốc trên sông Hậu' })
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('Tàu cao tốc trên sông Hậu'))
  })

  it('specifies under 125 characters', () => {
    const msgs = buildAltPrompt(BASE_CTX)
    const text = msgs.map(m => m.content).join('\n')
    assert.ok(text.includes('125'), 'should mention 125 char limit')
  })

  it('does not crash without imageContext', () => {
    const msgs = buildAltPrompt(BASE_CTX)
    assert.ok(Array.isArray(msgs))
  })
})

// ─── SEO_FIELD_SCHEMAS ────────────────────────────────────────────────────────

describe('SEO_FIELD_SCHEMAS', () => {
  it('has schemas for title, description, faq, alt', () => {
    assert.ok('title' in SEO_FIELD_SCHEMAS)
    assert.ok('description' in SEO_FIELD_SCHEMAS)
    assert.ok('faq' in SEO_FIELD_SCHEMAS)
    assert.ok('alt' in SEO_FIELD_SCHEMAS)
  })

  it('each schema is a non-empty string (passed to chatJson schemaHint)', () => {
    for (const [key, schema] of Object.entries(SEO_FIELD_SCHEMAS)) {
      assert.equal(typeof schema, 'string', `${key} schema should be a string`)
      assert.ok(schema.length > 0, `${key} schema should be non-empty`)
    }
  })
})
