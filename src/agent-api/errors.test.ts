import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { APIError, ValidationError } from 'payload'
import { z } from 'zod'

import { AgentError, toAgentError } from './errors'

describe('toAgentError', () => {
  it('turns zod failures into invalid with the offending path', () => {
    const parsed = z.strictObject({ id: z.number() }).safeParse({ id: 'x', extra: 1 })
    assert.equal(parsed.success, false)
    const err = toAgentError(parsed.error)
    assert.equal(err.code, 'invalid')
    assert.match(err.message, /id:/)
  })

  it('maps Payload APIError statuses to codes', () => {
    assert.equal(toAgentError(new APIError('nope', 403)).code, 'forbidden')
    assert.equal(toAgentError(new APIError('gone', 404)).code, 'not_found')
    assert.equal(toAgentError(new APIError('busy', 423)).code, 'locked')
  })

  it('detects a unique violation wrapped by the driver as conflict', () => {
    const err = new Error('Failed query', { cause: { code: '23505' } })
    assert.equal(toAgentError(err).code, 'conflict')
  })

  it('maps the ValidationError Payload raises for a unique index to conflict, whatever its language', () => {
    const err = new ValidationError({
      collection: 'posts',
      errors: [{ message: 'Lỗi - Giá trị không được trùng lặp.', path: 'slug', tableName: 'posts' }],
    })
    assert.equal(toAgentError(err).code, 'conflict')
  })

  it('keeps ordinary field validation errors as invalid', () => {
    const err = new ValidationError({ collection: 'posts', errors: [{ message: 'This field is required.', path: 'title' }] })
    assert.equal(toAgentError(err).code, 'invalid')
  })

  it('keeps query params (document bodies) out of the log line', () => {
    const logged: string[] = []
    toAgentError(new Error('Failed query: update "posts"\nparams: secret body text'), (m) => logged.push(m))
    assert.doesNotMatch(logged[0], /secret body/)
  })

  it('hides unexpected errors behind internal and logs the original', () => {
    const logged: string[] = []
    const err = toAgentError(new Error('password=change-me leaked'), (m) => logged.push(m))
    assert.equal(err.code, 'internal')
    assert.doesNotMatch(err.message, /change-me/)
    assert.match(logged[0], /change-me/)
  })

  it('passes AgentError through unchanged', () => {
    const original = new AgentError('conflict', 'stale', { currentUpdatedAt: 'x' })
    assert.equal(toAgentError(original), original)
  })
})
