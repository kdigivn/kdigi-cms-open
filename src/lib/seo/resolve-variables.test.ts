/**
 * Unit tests for resolveSeoTemplate — pure %variable% substitution + cleanup.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSeoTemplate } from './resolve-variables'

describe('resolveSeoTemplate — substitution', () => {
  it('substitutes each supported variable', () => {
    const ctx = {
      title: 'Bãi Sao',
      siteName: 'VTPQ',
      sep: '|',
      excerpt: 'Bãi biển đẹp',
      category: 'Du lịch',
      focusKw: 'bãi sao',
      ptSingle: 'Bài viết',
      ptPlural: 'Bài viết',
      date: '2026-06-17',
      modified: '2026-06-18',
    }
    assert.equal(resolveSeoTemplate('%title%', ctx), 'Bãi Sao')
    assert.equal(resolveSeoTemplate('%sitename%', ctx), 'VTPQ')
    // %sep% is only meaningful between content; standalone it is a dangling
    // separator and cleaned away — exercised via 'a %sep% b' below.
    assert.equal(resolveSeoTemplate('%excerpt%', ctx), 'Bãi biển đẹp')
    assert.equal(resolveSeoTemplate('%category%', ctx), 'Du lịch')
    assert.equal(resolveSeoTemplate('%focuskw%', ctx), 'bãi sao')
    assert.equal(resolveSeoTemplate('%pt_single%', ctx), 'Bài viết')
    assert.equal(resolveSeoTemplate('%date%', ctx), '2026-06-17')
    assert.equal(resolveSeoTemplate('%modified%', ctx), '2026-06-18')
  })

  it('combines multiple variables in one template', () => {
    const out = resolveSeoTemplate('%title% %sep% %sitename%', {
      title: 'Bãi Sao',
      siteName: 'VTPQ',
      sep: '|',
    })
    assert.equal(out, 'Bãi Sao | VTPQ')
  })

  it('defaults %sep% to "|" when ctx.sep absent', () => {
    assert.equal(resolveSeoTemplate('a %sep% b', {}), 'a | b')
  })

  it('uses a custom separator', () => {
    const out = resolveSeoTemplate('%title% %sep% %sitename%', {
      title: 'A',
      siteName: 'B',
      sep: '-',
    })
    assert.equal(out, 'A - B')
  })
})

describe('resolveSeoTemplate — cleanup', () => {
  it('strips a leading separator when the first var is empty', () => {
    const out = resolveSeoTemplate('%title% %sep% %sitename%', {
      siteName: 'VTPQ',
      sep: '|',
    })
    assert.equal(out, 'VTPQ')
  })

  it('strips a trailing separator when the last var is empty', () => {
    const out = resolveSeoTemplate('%title% %sep% %sitename%', {
      title: 'Bãi Sao',
      sep: '|',
    })
    assert.equal(out, 'Bãi Sao')
  })

  it('collapses a doubled separator when a middle var is empty', () => {
    const out = resolveSeoTemplate('%title% %sep% %excerpt% %sep% %sitename%', {
      title: 'Bãi Sao',
      siteName: 'VTPQ',
      sep: '|',
    })
    assert.equal(out, 'Bãi Sao | VTPQ')
  })

  it('drops unknown variables and collapses the gap', () => {
    const out = resolveSeoTemplate('%title% %term% %sitename%', {
      title: 'A',
      siteName: 'B',
    })
    assert.equal(out, 'A B')
  })

  it('returns empty string for an all-empty template', () => {
    assert.equal(resolveSeoTemplate('%title% %sep% %sitename%', { sep: '|' }), '')
  })

  it('returns empty string for an empty template input', () => {
    assert.equal(resolveSeoTemplate('', { title: 'A' }), '')
  })

  it('keeps literal text around variables', () => {
    const out = resolveSeoTemplate('Mua %title% giá tốt', { title: 'vé tàu' })
    assert.equal(out, 'Mua vé tàu giá tốt')
  })
})

describe('resolveSeoTemplate — %currentyear% and %price%', () => {
  it('resolves %currentyear% to the current calendar year', () => {
    const year = String(new Date().getFullYear())
    const out = resolveSeoTemplate('%title% %currentyear%', { title: 'Vé sản phẩm', currentYear: year })
    assert.equal(out, `Vé sản phẩm ${year}`)
  })

  it('resolves %price% from ctx.price', () => {
    const out = resolveSeoTemplate('Giá chỉ %price% VND', { price: '150000' })
    assert.equal(out, 'Giá chỉ 150000 VND')
  })

  it('strips %price% when ctx.price is empty', () => {
    const out = resolveSeoTemplate('Giá %price%', { price: '' })
    assert.equal(out, 'Giá')
  })

  it('strips %currentyear% when ctx.currentYear is absent', () => {
    // Without currentYear in ctx, variable is unknown and stripped
    const out = resolveSeoTemplate('%title% %sep% %currentyear%', { title: 'A', sep: '|' })
    assert.equal(out, 'A')
  })
})
