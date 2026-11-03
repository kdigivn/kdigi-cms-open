/**
 * Connection settings. Precedence: flags > env (`KCMS_URL`, `KCMS_API_KEY`, `KCMS_SITE`) >
 * profile in `~/.config/kcms/config.json` (mode 0600; `KCMS_CONFIG` overrides the path).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { CliError, EXIT } from './errors.js'

export interface Profile {
  url: string
  apiKey?: string
  site?: string
}

export interface ConfigFile {
  default?: string
  profiles: Record<string, Profile>
}

export interface Connection {
  url: string
  apiKey: string
  site?: string
  profile: string
}

export interface ConnectionFlags {
  profile?: string
  url?: string
  site?: string
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.KCMS_CONFIG) return env.KCMS_CONFIG
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'kcms', 'config.json')
}

export function readConfig(path = configPath()): ConfigFile {
  if (!existsSync(path)) return { profiles: {} }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || !('profiles' in parsed)) return { profiles: {} }
    return parsed as ConfigFile
  } catch {
    throw new CliError(`Cannot parse ${path} — fix or delete it.`, EXIT.usage)
  }
}

export function writeConfig(config: ConfigFile, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
}

/** Strip trailing slashes and a pasted `/api/mcp` / `/admin` suffix → the CMS base URL. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new CliError(`Not a valid URL: ${raw}`, EXIT.usage)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CliError('URL must be http(s).', EXIT.usage)
  return `${url.origin}${url.pathname.replace(/\/(api\/mcp|admin)\/?$/, '').replace(/\/+$/, '')}`
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** True when the key would cross the network in clear text. */
export function isInsecureRemote(url: string): boolean {
  const { protocol, hostname } = new URL(url)
  return protocol === 'http:' && !LOCAL_HOSTS.includes(hostname)
}

export function resolveConnection(flags: ConnectionFlags, env: NodeJS.ProcessEnv = process.env, config = readConfig(configPath(env))): Connection {
  const profileName = flags.profile ?? env.KCMS_PROFILE ?? config.default ?? 'default'
  const profile: Partial<Profile> = config.profiles[profileName] ?? {}
  if (flags.profile && !config.profiles[flags.profile]) {
    throw new CliError(`Profile "${flags.profile}" does not exist — run: kcms login --profile ${flags.profile}`, EXIT.usage)
  }
  const url = flags.url ?? env.KCMS_URL ?? profile.url
  const apiKey = env.KCMS_API_KEY || profile.apiKey
  if (!url || !apiKey) {
    throw new CliError('Not configured — run `kcms login`, or set KCMS_URL and KCMS_API_KEY.', EXIT.auth)
  }
  return { url: normalizeBaseUrl(url), apiKey, site: flags.site ?? env.KCMS_SITE ?? profile.site, profile: profileName }
}
