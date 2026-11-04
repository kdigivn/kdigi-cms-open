import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Command } from 'commander'

import { setupOptions } from './setup.js'

/** Parse through the real option definition used by `kcms setup`. */
function parse(argv: string[]): Record<string, unknown> {
  const program = new Command()
  setupOptions(program.command('setup <target>')).action(() => {})
  program.parse(['setup', ...argv], { from: 'user' })
  return program.commands[0].opts()
}

describe('kcms setup options', () => {
  it('parses a bare --with-skill as true, even when a flag follows', () => {
    const opts = parse(['claude-code', '--with-skill', '--write'])
    assert.equal(opts.withSkill, true)
    assert.equal(opts.write, true)
    assert.equal(opts.scope, 'project')
  })

  it('keeps the value of --with-skill when one is given', () => {
    const opts = parse(['claude-code', '--with-skill', 'kcms,kcms-frontend', '--scope', 'user'])
    assert.equal(opts.withSkill, 'kcms,kcms-frontend')
    assert.equal(opts.scope, 'user')
  })

  it('leaves --with-skill absent when not passed', () => {
    assert.equal(parse(['cursor']).withSkill, undefined)
  })
})
