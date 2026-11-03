/**
 * Unit tests for the paste-URL endpoint's pure URL validator.
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateUrl, MAX_URL_LENGTH } from './create-media-from-url-helpers'

describe('validateUrl', () => {
  it('accepts a well-formed https URL', () => {
    assert.equal(validateUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg')
  })
  it('accepts a well-formed http URL', () => {
    assert.equal(validateUrl('http://example.com/img.png'), 'http://example.com/img.png')
  })
  it('rejects a non-string', () => {
    assert.throws(() => validateUrl(123), /url is required/)
    assert.throws(() => validateUrl(null), /url is required/)
    assert.throws(() => validateUrl(undefined), /url is required/)
  })
  it('rejects an empty string', () => {
    assert.throws(() => validateUrl(''), /url is required/)
  })
  it('rejects a non-URL string', () => {
    assert.throws(() => validateUrl('not a url'), /not a valid URL/)
    assert.throws(() => validateUrl('example.com'), /not a valid URL/)
  })
  it('rejects a URL exceeding the max length', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH)
    assert.throws(() => validateUrl(longUrl), /too long/)
  })
  it('rejects non-http(s) protocols (SSRF guard)', () => {
    assert.throws(() => validateUrl('file:///etc/passwd'), /must be http or https/)
    assert.throws(() => validateUrl('gopher://example.com'), /must be http or https/)
    assert.throws(() => validateUrl('ftp://example.com/file'), /must be http or https/)
    assert.throws(() => validateUrl('data:image/png;base64,xxx'), /must be http or https/)
  })
  it('accepts a URL with query string and fragment', () => {
    assert.equal(
      validateUrl('https://cdn.example.com/img.jpg?w=100&h=200#anchor'),
      'https://cdn.example.com/img.jpg?w=100&h=200#anchor',
    )
  })
  it('accepts a URL with port and userinfo', () => {
    assert.equal(
      validateUrl('https://user:pass@example.com:8080/path'),
      'https://user:pass@example.com:8080/path',
    )
  })
})
