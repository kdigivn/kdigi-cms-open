/**
 * Hard backup gate before any import phase WRITES to a non-local database.
 *
 * "Local" = the DATABASE_URI host is loopback (`localhost`, `127.0.0.1`, `::1`,
 * `host.docker.internal`) or listed in `KDIGI_LOCAL_DB_HOSTS` (comma-separated,
 * e.g. the docker-compose service name `postgres`). Anything else is treated as
 * a shared/production database: a `pg_dump` custom-format backup is taken first
 * and a failed or empty dump ABORTS the run. There is intentionally no flag to
 * skip the backup (docs/wordpress-migration/runbook.md, "Backup gate").
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

type EnvLike = Record<string, string | undefined>

const BUILTIN_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']

function localHosts(env: EnvLike): Set<string> {
  const extra = (env.KDIGI_LOCAL_DB_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...BUILTIN_LOCAL_HOSTS, ...extra])
}

/** True when `databaseUri` points at a database that is not declared local. */
export function isRemoteDatabase(databaseUri: string | undefined, env: EnvLike = process.env): boolean {
  if (!databaseUri) return false
  try {
    const host = new URL(databaseUri).hostname.toLowerCase()
    return !localHosts(env).has(host)
  } catch {
    // Unparseable URI — assume remote and demand a backup rather than risk real data.
    return true
  }
}

/** Runs pg_dump into `backups-local/` (override with BACKUP_DIR). Throws (ABORT) on any failure. */
export function runDatabaseBackup(label: string): string {
  const databaseUri = process.env.DATABASE_URI
  if (!databaseUri) throw new Error('DATABASE_URI missing — cannot back up')

  const dir = path.resolve(process.cwd(), process.env.BACKUP_DIR || 'backups-local')
  fs.mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-')
  const file = path.join(dir, `db-${ts}-pre-${safeLabel}.dump`)

  console.log(`[backup] pg_dump → ${file}`)
  const result = spawnSync('pg_dump', ['-Fc', '-f', file, `--dbname=${databaseUri}`], {
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 15 * 60 * 1000,
  })
  if (result.error) throw new Error(`⛔ ABORT — pg_dump failed to start: ${result.error.message} (install postgresql-client)`)
  if (result.status !== 0) throw new Error(`⛔ ABORT — pg_dump exited ${result.status}`)
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  if (size <= 0) throw new Error('⛔ ABORT — backup file is empty')
  console.log(`[backup] OK — ${(size / 1024 / 1024).toFixed(1)} MB`)
  return file
}
