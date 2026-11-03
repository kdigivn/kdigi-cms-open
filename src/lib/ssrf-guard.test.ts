/**
 * Unit tests for the SSRF guard.
 * Runner: node --import tsx --test
 *
 * Coverage:
 *   - isPrivateIPv4 / isPrivateIPv6 — every documented blocked range
 *   - isPrivateIP — dispatch + invalid IPs
 *   - assertHostnameSafe — IP literal, DNS, blocked resolutions
 *   - assertUrlSafe — protocol, length, hostname, integration
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  assertHostnameSafe,
  assertUrlSafe,
  SsrfBlockedError,
} from './ssrf-guard'

// ─── isPrivateIPv4 ──────────────────────────────────────────────────────────

describe('isPrivateIPv4', () => {
  it('blocks 10.0.0.0/8', () => {
    assert.equal(isPrivateIPv4('10.0.0.0'), true)
    assert.equal(isPrivateIPv4('10.255.255.255'), true)
    assert.equal(isPrivateIPv4('10.1.2.3'), true)
    assert.equal(isPrivateIPv4('11.0.0.0'), false)
  })
  it('blocks 172.16.0.0/12', () => {
    assert.equal(isPrivateIPv4('172.16.0.0'), true)
    assert.equal(isPrivateIPv4('172.31.255.255'), true)
    assert.equal(isPrivateIPv4('172.32.0.0'), false)
    assert.equal(isPrivateIPv4('172.15.0.0'), false)
  })
  it('blocks 192.168.0.0/16', () => {
    assert.equal(isPrivateIPv4('192.168.0.0'), true)
    assert.equal(isPrivateIPv4('192.168.255.255'), true)
    assert.equal(isPrivateIPv4('192.169.0.0'), false)
  })
  it('blocks 127.0.0.0/8 (loopback)', () => {
    assert.equal(isPrivateIPv4('127.0.0.1'), true)
    assert.equal(isPrivateIPv4('127.255.255.255'), true)
    assert.equal(isPrivateIPv4('128.0.0.0'), false)
  })
  it('blocks 169.254.0.0/16 (link-local / cloud metadata)', () => {
    assert.equal(isPrivateIPv4('169.254.169.254'), true) // AWS / GCP / Azure
    assert.equal(isPrivateIPv4('169.254.0.1'), true)
    assert.equal(isPrivateIPv4('169.255.0.0'), false)
  })
  it('blocks 0.0.0.0/8 (unspecified)', () => {
    assert.equal(isPrivateIPv4('0.0.0.0'), true)
    assert.equal(isPrivateIPv4('0.255.255.255'), true)
  })
  it('blocks 100.64.0.0/10 (CGN)', () => {
    assert.equal(isPrivateIPv4('100.64.0.0'), true)
    assert.equal(isPrivateIPv4('100.127.255.255'), true)
    assert.equal(isPrivateIPv4('100.128.0.0'), false)
  })
  it('blocks 224.0.0.0/4 (multicast)', () => {
    assert.equal(isPrivateIPv4('224.0.0.1'), true)
    assert.equal(isPrivateIPv4('239.255.255.255'), true)
  })
  it('blocks 240.0.0.0/4 (reserved/broadcast)', () => {
    assert.equal(isPrivateIPv4('255.255.255.255'), true)
  })
  it('allows public IPs', () => {
    assert.equal(isPrivateIPv4('1.1.1.1'), false)
    assert.equal(isPrivateIPv4('8.8.8.8'), false)
    assert.equal(isPrivateIPv4('93.184.216.34'), false) // example.com
  })
  it('returns false for invalid IPv4 strings', () => {
    assert.equal(isPrivateIPv4('not an ip'), false)
    assert.equal(isPrivateIPv4('1.2.3'), false)
    assert.equal(isPrivateIPv4('1.2.3.4.5'), false)
    assert.equal(isPrivateIPv4('256.0.0.0'), false)
  })
})

// ─── isPrivateIPv6 ──────────────────────────────────────────────────────────

describe('isPrivateIPv6', () => {
  it('blocks ::1 (loopback)', () => {
    assert.equal(isPrivateIPv6('::1'), true)
  })
  it('blocks :: (unspecified)', () => {
    assert.equal(isPrivateIPv6('::'), true)
  })
  it('blocks fc00::/7 (ULA)', () => {
    assert.equal(isPrivateIPv6('fc00::1'), true)
    assert.equal(isPrivateIPv6('fd00::1'), true)
    assert.equal(isPrivateIPv6('fcab::1'), true)
  })
  it('blocks fe80::/10 (link-local)', () => {
    assert.equal(isPrivateIPv6('fe80::1'), true)
    assert.equal(isPrivateIPv6('fe80::abcd'), true)
  })
  it('blocks ff00::/8 (multicast)', () => {
    assert.equal(isPrivateIPv6('ff02::1'), true)
  })
  it('strips zone identifier before checking', () => {
    assert.equal(isPrivateIPv6('fe80::1%eth0'), true)
    assert.equal(isPrivateIPv6('::1%lo0'), true)
  })
  it('allows public IPv6', () => {
    assert.equal(isPrivateIPv6('2001:db8::1'), false) // documentation prefix but not private
    assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false) // Cloudflare DNS
  })
  it('blocks IPv4-mapped IPv6 pointing at private/metadata addresses (dotted form)', () => {
    // net.isIP() reports family 6 for these, so without explicit handling they
    // slip past every IPv6 prefix check and reach the embedded IPv4 target.
    assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true) // loopback
    assert.equal(isPrivateIPv6('::ffff:169.254.169.254'), true) // cloud metadata
    assert.equal(isPrivateIPv6('::ffff:10.0.0.5'), true) // RFC1918
    assert.equal(isPrivateIPv6('::ffff:192.168.1.1'), true)
  })
  it('blocks IPv4-mapped IPv6 in hex form', () => {
    assert.equal(isPrivateIPv6('::ffff:7f00:1'), true) // 127.0.0.1
    assert.equal(isPrivateIPv6('::ffff:a9fe:a9fe'), true) // 169.254.169.254
  })
  it('allows IPv4-mapped IPv6 pointing at a public address', () => {
    assert.equal(isPrivateIPv6('::ffff:1.1.1.1'), false)
    assert.equal(isPrivateIPv6('::ffff:0101:0101'), false) // 1.1.1.1 hex
  })
})

// ─── isPrivateIP ───────────────────────────────────────────────────────────

describe('isPrivateIP', () => {
  it('dispatches on family', () => {
    assert.equal(isPrivateIP('10.0.0.1'), true)
    assert.equal(isPrivateIP('::1'), true)
    assert.equal(isPrivateIP('1.1.1.1'), false)
    assert.equal(isPrivateIP('2606:4700:4700::1111'), false)
  })
  it('treats invalid input as untrusted (returns true)', () => {
    // If we can't parse the IP, refuse the request — fail-closed.
    assert.equal(isPrivateIP('garbage'), true)
    assert.equal(isPrivateIP(''), true)
  })
})

// ─── assertHostnameSafe (synchronous behavior on IP literals) ──────────────

describe('assertHostnameSafe (IP literal path)', () => {
  it('accepts a public IP literal', async () => {
    const addrs = await assertHostnameSafe('1.1.1.1')
    assert.deepEqual(addrs, ['1.1.1.1'])
  })
  it('rejects a private IP literal with SsrfBlockedError', async () => {
    await assert.rejects(
      () => assertHostnameSafe('127.0.0.1'),
      (err: unknown) => err instanceof SsrfBlockedError && /loopback|private/.test((err as Error).message),
    )
    await assert.rejects(
      () => assertHostnameSafe('169.254.169.254'),
      SsrfBlockedError,
    )
    await assert.rejects(
      () => assertHostnameSafe('10.0.0.1'),
      SsrfBlockedError,
    )
  })
  it('rejects a private IPv6 literal', async () => {
    await assert.rejects(() => assertHostnameSafe('::1'), SsrfBlockedError)
    await assert.rejects(() => assertHostnameSafe('fc00::1'), SsrfBlockedError)
  })
})

// ─── assertHostnameSafe (DNS path — depends on real DNS) ──────────────────

describe('assertHostnameSafe (DNS path)', () => {
  it('resolves a public hostname to one or more public addresses', async () => {
    // Use a well-known public hostname. If DNS is unavailable in the
    // test runner, this will fail with SsrfBlockedError('DNS resolve')
    // rather than the success case — skip in that case.
    try {
      const addrs = await assertHostnameSafe('one.one.one.one')
      assert.ok(addrs.length > 0)
      for (const a of addrs) {
        assert.equal(isPrivateIP(a), false, `expected ${a} to be public`)
      }
    } catch (err) {
      if (err instanceof SsrfBlockedError && /DNS resolve/.test(err.message)) {
        // Skip — no network in test runner
      } else {
        throw err
      }
    }
  })
})

// ─── assertUrlSafe (integration) ───────────────────────────────────────────

describe('assertUrlSafe', () => {
  it('accepts a public https URL with hostname safety check', async () => {
    try {
      const res = await assertUrlSafe('https://example.com/photo.jpg')
      assert.equal(res.url, 'https://example.com/photo.jpg')
      assert.ok(res.addresses.length > 0)
    } catch (err) {
      if (err instanceof SsrfBlockedError && /DNS resolve/.test(err.message)) return
      throw err
    }
  })
  it('rejects an http://127.0.0.1 URL (literal private IP)', async () => {
    await assert.rejects(
      () => assertUrlSafe('http://127.0.0.1/admin'),
      (err: unknown) => err instanceof SsrfBlockedError,
    )
  })
  it('rejects file:// scheme', async () => {
    await assert.rejects(
      () => assertUrlSafe('file:///etc/passwd'),
      /must be http or https/,
    )
  })
  it('rejects gopher:// scheme', async () => {
    await assert.rejects(
      () => assertUrlSafe('gopher://example.com/'),
      /must be http or https/,
    )
  })
  it('rejects data: URL', async () => {
    await assert.rejects(
      () => assertUrlSafe('data:image/png;base64,abc'),
      /must be http or https/,
    )
  })
  it('rejects non-string input', async () => {
    await assert.rejects(() => assertUrlSafe(123 as unknown as string), /url is required/)
  })
  it('rejects empty string', async () => {
    await assert.rejects(() => assertUrlSafe(''), /url is required/)
  })
  it('rejects a too-long URL', async () => {
    const long = 'https://example.com/' + 'a'.repeat(600)
    await assert.rejects(() => assertUrlSafe(long), /too long/)
  })
  it('rejects an invalid URL string', async () => {
    await assert.rejects(() => assertUrlSafe('not a url'), /not a valid URL/)
  })
})
