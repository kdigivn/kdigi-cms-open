#!/usr/bin/env node
/**
 * WordPress → KDIGI CMS migration orchestrator (docs/wordpress-migration/).
 * One parameterized, idempotent command that works for any WordPress site:
 *
 *   node --env-file=.env --import tsx src/importers/run-wp-migration.ts \
 *     --site <siteKey> --wp-url https://wp.example.com --domain example.com \
 *     [--public-url https://www.example.com] [--lang vi|en] \
 *     [--archive] [--archive-via auto|graphql|rest] [--regen-staged] \
 *     [--cpt portfolio=posts,event=pages] [--only media,...] \
 *     [--gate lint|lock|status] [--from <phase>] [--to <phase>] \
 *     [--media-urls cms|source] [--dry-run] [--yes]
 *
 * Default run: archive (when raw/ missing) → normalize (when staged/ missing)
 * → STOP at the review gate with co-edit instructions, exit non-zero.
 * Import phases run only with a valid .gate-lock. A DATABASE_URI that is not
 * local triggers the mandatory pg_dump backup first (prod-backup-gate.ts).
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { spawnSync } from 'child_process'
import {
  IMPORT_PHASES,
  buildSiteConfig,
  rawDir,
  stagedDir,
  type ImportPhase,
  type SiteMigrationConfig,
} from './wp-migration/wp-migration-config'
import { normalizeRawToStaged } from './wp-migration/normalize-raw-to-staged'
import { runGateLint, runGateLock, runGateStatus, verifyGateLock } from './wp-migration/staged-gate'
import { isRemoteDatabase, runDatabaseBackup } from './wp-migration/prod-backup-gate'

// ── CLI parsing ───────────────────────────────────────────────────────────────

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.split('=').slice(1).join('=')
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1]
  return undefined
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`)

const GATE_CMD = argValue('gate') as 'lint' | 'lock' | 'status' | undefined
const FROM = argValue('from') as ImportPhase | undefined
const TO = argValue('to') as ImportPhase | undefined
const DRY_RUN = hasFlag('dry-run')
const YES = hasFlag('yes')
const REGEN_STAGED = hasFlag('regen-staged')
const FORCE_ARCHIVE = hasFlag('archive')
const ARCHIVE_VIA = (argValue('archive-via') ?? 'auto') as 'auto' | 'graphql' | 'rest'
const MEDIA_URLS = (argValue('media-urls') ?? 'cms') as 'cms' | 'source'
// Scope normalize to specific collections (e.g. `media`) without touching other co-edits.
const ONLY = argValue('only')
const ONLY_COLLECTIONS = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : undefined

/** `--cpt portfolio=posts,event=pages` → { portfolio: 'posts', event: 'pages' } */
function parseCptMap(raw: string | undefined): Record<string, 'posts' | 'pages' | 'products'> {
  const map: Record<string, 'posts' | 'pages' | 'products'> = {}
  for (const pair of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [type, target] = pair.split('=')
    if (!type || (target !== 'posts' && target !== 'pages' && target !== 'products')) {
      usageExit(`invalid --cpt entry "${pair}" (expected <post-type>=posts|pages|products)`)
    }
    map[type] = target
  }
  return map
}
const CPT_MAP = parseCptMap(argValue('cpt'))

function usageExit(msg: string): never {
  console.error(`✖ ${msg}`)
  console.error(
    '\nUsage: node --env-file=.env --import tsx src/importers/run-wp-migration.ts \\\n' +
      '  --site my-site --wp-url https://wp.example.com --domain example.com \\\n' +
      '  [--public-url https://www.example.com]  # public host of the old site, if different from --wp-url\n' +
      '  [--lang vi|en]                          # site language (default vi); multilingual sources keep this language\n' +
      '  [--archive] [--archive-via auto|graphql|rest] [--regen-staged]\n' +
      '  [--cpt portfolio=posts,...]             # import custom post types into posts|pages|products\n' +
      '  [--only media,...]                      # normalize only these collections\n' +
      '  [--gate lint|lock|status] [--from <phase>] [--to <phase>]\n' +
      '  [--media-urls cms|source]               # inline images → CMS-hosted URL (default) or keep source URL\n' +
      '  [--dry-run] [--yes]\n' +
      `\nPhases: ${IMPORT_PHASES.join(' → ')}\n` +
      'Env: DATABASE_URI (required for import), WP_AUTH_USER/WP_AUTH_PASSWORD (optional WP application password),\n' +
      '     WP_POST_TYPES (extra post types to archive), WP_UTC_OFFSET (e.g. +07:00), KDIGI_LOCAL_DB_HOSTS.',
  )
  process.exit(2)
}

if (MEDIA_URLS !== 'cms' && MEDIA_URLS !== 'source') usageExit('--media-urls must be cms or source')
if (ARCHIVE_VIA !== 'auto' && ARCHIVE_VIA !== 'graphql' && ARCHIVE_VIA !== 'rest') usageExit('--archive-via must be auto|graphql|rest')

// `--gate status` only needs the site key; everything else needs the full triple:
// archive+normalize fetch from wpUrl, lint/lock check canonicals against both hosts,
// seed writes the domain into the Site doc.
const siteArg = argValue('site') ?? ''
if (!siteArg) usageExit('--site is required')
const wpUrlArg = argValue('wp-url') ?? process.env.WP_URL ?? ''
const domainArg = argValue('domain') ?? ''
if (GATE_CMD !== 'status' && (!wpUrlArg || !domainArg)) {
  usageExit('--wp-url and --domain are required (only --gate status may omit them)')
}

let cfg: SiteMigrationConfig
try {
  cfg = buildSiteConfig({
    site: siteArg,
    // --gate status never touches the network; a placeholder keeps the config valid.
    wpUrl: wpUrlArg || 'https://wp.invalid',
    publicUrl: argValue('public-url'),
    domain: domainArg || 'status.invalid',
    language: argValue('lang'),
  })
} catch (err) {
  usageExit(err instanceof Error ? err.message : String(err))
}

async function confirm(question: string): Promise<boolean> {
  if (YES) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((res) => rl.question(`${question} [y/N] `, res))
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

// ── Archive (step 1) — spawn the parameterized scripts ───────────────────────

function runScript(label: string, script: string, args: string[], env: NodeJS.ProcessEnv, allowedExit: number[] = [0]): number {
  console.log(`\n=== archive: ${label} ===`)
  const result = spawnSync('node', ['--import', 'tsx', script, ...args], { stdio: 'inherit', env })
  const status = result.status ?? 1
  if (!allowedExit.includes(status)) throw new Error(`archive step failed: ${label} (exit ${status})`)
  return status
}

function runArchive(): void {
  const out = rawDir(cfg)
  const env = { ...process.env, WP_URL: cfg.wpUrl, OUT: out }
  const hasAuth = Boolean(process.env.WP_AUTH_USER && process.env.WP_AUTH_PASSWORD)
  if (!hasAuth) {
    console.log('[archive] WP_AUTH_USER / WP_AUTH_PASSWORD not set — private/unattached media and menus behind auth will be missing')
  }

  // 1) REST mirror + media binaries — always (media is only reachable through REST).
  runScript('REST mirror + media', 'src/scripts/wp-archive-rest.ts', hasAuth ? ['--authed-media'] : [], env)

  // 2) Unified content snapshot: WPGraphQL when available (richer SEO/menus), else built from the REST mirror.
  let snapshotDone = false
  if (ARCHIVE_VIA !== 'rest') {
    const probe = runScript('probe WPGraphQL', 'src/scripts/wp-archive-graphql.ts', ['--probe'], env, [0, 3])
    if (probe === 0) {
      runScript('WPGraphQL content snapshot', 'src/scripts/wp-archive-graphql.ts', [], env)
      snapshotDone = true
    } else if (ARCHIVE_VIA === 'graphql') {
      throw new Error('--archive-via graphql requested but the WPGraphQL endpoint is not available')
    } else {
      console.log('[archive] WPGraphQL not available — building the content snapshot from REST')
    }
  }
  if (!snapshotDone) runScript('REST content snapshot', 'src/scripts/wp-archive-rest-content.ts', [], env)
}

// ── Import phases (step 4/5) ──────────────────────────────────────────────────

async function runImportPhases(from: ImportPhase, to: ImportPhase): Promise<void> {
  const fromIdx = IMPORT_PHASES.indexOf(from)
  const toIdx = IMPORT_PHASES.indexOf(to)
  if (fromIdx === -1) usageExit(`unknown phase: ${from}`)
  if (toIdx === -1) usageExit(`unknown phase: ${to}`)
  if (fromIdx > toIdx) usageExit(`--from ${from} is after --to ${to}`)
  const phases = IMPORT_PHASES.slice(fromIdx, toIdx + 1)

  // ⛔ Review gate — prerequisite for every WRITING import phase.
  // --dry-run is read-only, so it may preview phases before the editor locks.
  const gate = verifyGateLock(cfg)
  if (!gate.ok && !DRY_RUN) {
    console.error(`\n⛔ GATE: ${gate.reason}`)
    console.error('Review staged/ then:')
    console.error('  --gate lint   # must be clean')
    console.error('  --gate lock   # editor approval')
    process.exit(1)
  }
  if (gate.ok) console.log(`✔ gate lock valid (approver=${gate.lock?.approver} @ ${gate.lock?.timestamp})`)
  else console.log('⚠ gate not locked — allowed only because this is a --dry-run preview')

  // ⛔ Backup gate — mandatory for non-local databases, no skip flag
  if (isRemoteDatabase(process.env.DATABASE_URI)) {
    console.log('\n⚠ NON-LOCAL database detected (DATABASE_URI host is not loopback / KDIGI_LOCAL_DB_HOSTS)')
    if (DRY_RUN) {
      console.log('[backup] dry-run — skipping pg_dump (no writes will occur)')
    } else {
      if (!(await confirm(`Import ${phases.join(', ')} into the NON-LOCAL database for site "${cfg.site}"?`))) {
        console.log('aborted by user')
        process.exit(1)
      }
      runDatabaseBackup(`wp-migration-${cfg.site}`)
    }
  }

  // schema phase runs before getPayload (migrations change the schema)
  if (phases.includes('schema')) {
    const { runSchemaPhase } = await import('./wp-migration/phase-schema-and-seed')
    await runSchemaPhase(cfg, DRY_RUN)
  }

  const payloadPhases = phases.filter((p) => p !== 'schema')
  if (!payloadPhases.length) return

  // Lazy imports — getPayload boots the full config (hooks, DB, storage)
  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('../payload.config')
  const payload = await getPayload({ config: payloadConfig })
  const { seedSiteDoc, runSeedPhase } = await import('./wp-migration/phase-schema-and-seed')
  const { resolveTenantId, makeLogger } = await import('./wp-migration/import-context')

  // seed creates the Site doc — resolve the site id afterwards
  const log = makeLogger('orchestrator')
  let tenantId: string | number
  if (payloadPhases.includes('seed')) {
    const seedResult = await seedSiteDoc({ cfg, payload, tenantId: -1, dryRun: DRY_RUN, log })
    tenantId = seedResult.tenantId
  } else {
    tenantId = await resolveTenantId(payload, cfg.site)
  }
  const ctx = { cfg, payload, tenantId, dryRun: DRY_RUN, log, mediaUrls: MEDIA_URLS }

  for (const phase of payloadPhases) {
    // Re-verify gate hash per phase: import-context.ts re-reads staged/ every
    // phase, so a mid-run co-edit (file changed since lock) must abort the
    // whole run instead of silently writing against drifted state.
    const liveGate = verifyGateLock(cfg)
    if (!liveGate.ok && !DRY_RUN) {
      console.error(`\n⛔ GATE drift mid-run at phase=${phase}: ${liveGate.reason}`)
      console.error('Re-lock staged/ before continuing:')
      console.error('  --gate lint  # fix anything flagged')
      console.error('  --gate lock  # editor approval')
      process.exit(1)
    }
    console.log(`\n━━━ phase: ${phase} ${DRY_RUN ? '(dry-run)' : ''} ━━━`)
    switch (phase) {
      case 'seed': {
        await runSeedPhase(ctx)
        break
      }
      case 'taxonomy': {
        const { runTaxonomyPhase } = await import('./wp-migration/phase-taxonomy')
        await runTaxonomyPhase(ctx)
        break
      }
      case 'content': {
        const { runContentPhase } = await import('./wp-migration/phase-content')
        await runContentPhase(ctx)
        break
      }
      case 'media': {
        const { runMediaPhase } = await import('./wp-migration/phase-media')
        await runMediaPhase(ctx)
        break
      }
      case 'seo': {
        const { runSeoPhase } = await import('./wp-migration/phase-seo')
        await runSeoPhase(ctx)
        break
      }
      case 'nav': {
        const { runNavPhase } = await import('./wp-migration/phase-nav')
        await runNavPhase(ctx)
        break
      }
      case 'comments': {
        const { runCommentsPhase } = await import('./wp-migration/phase-comments')
        await runCommentsPhase(ctx)
        break
      }
      case 'redirects': {
        const { runRedirectsPhase } = await import('./wp-migration/phase-redirects')
        await runRedirectsPhase(ctx)
        break
      }
    }
  }
  console.log('\n✔ import phases complete')
}

// ── Main flow ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `site=${cfg.site} wp-url=${GATE_CMD === 'status' ? '-' : cfg.wpUrl} domain=${GATE_CMD === 'status' ? '-' : cfg.domain} ` +
      `db=${isRemoteDatabase(process.env.DATABASE_URI) ? 'NON-LOCAL' : 'local'}`,
  )

  // Gate subcommands
  if (GATE_CMD === 'lint') process.exit(runGateLint(cfg) ? 0 : 1)
  if (GATE_CMD === 'lock') process.exit(runGateLock(cfg) ? 0 : 1)
  if (GATE_CMD === 'status') {
    runGateStatus(cfg)
    process.exit(0)
  }

  // Explicit import range → phases only
  if (FROM || TO) {
    await runImportPhases(FROM ?? IMPORT_PHASES[0], TO ?? IMPORT_PHASES[IMPORT_PHASES.length - 1])
    process.exit(0)
  }

  // Default: archive → normalize → stop at the gate.
  // --only skips the archive trigger — it only re-normalizes named collections from an existing raw/.
  const raw = rawDir(cfg)
  const rawExists = fs.existsSync(path.join(raw, 'content', 'posts.json'))
  if (!ONLY_COLLECTIONS && (FORCE_ARCHIVE || !rawExists)) {
    if (rawExists) {
      console.log('[archive] raw/ exists — re-running (idempotent: JSON re-fetched, media binaries only fill gaps)')
      if (!(await confirm('Re-fetch archive from WordPress?'))) process.exit(1)
    }
    runArchive()
  } else if (!ONLY_COLLECTIONS) {
    console.log(`[archive] raw/ present (${raw}) — skipping (use --archive to re-fetch)`)
  }

  const stagedExists = fs.existsSync(stagedDir(cfg))
  if (ONLY_COLLECTIONS) {
    // Scoped normalize (e.g. --only media) touches only the named collections'
    // own files — never a wholesale co-edit overwrite, so it runs regardless
    // of stagedExists / --regen-staged.
    const counts = normalizeRawToStaged(cfg, ONLY_COLLECTIONS, { cptMap: CPT_MAP })
    console.log('[normalize --only] staged counts:', JSON.stringify(counts))
  } else if (stagedExists && !REGEN_STAGED) {
    console.log('[normalize] staged/ present — NOT overwriting co-edits (use --regen-staged to rebuild from raw/)')
  } else {
    if (stagedExists && REGEN_STAGED) {
      console.log('⚠ --regen-staged will OVERWRITE every co-edit in staged/')
      if (!(await confirm('Rebuild staged/ from raw/?'))) process.exit(1)
    }
    const counts = normalizeRawToStaged(cfg, undefined, { cptMap: CPT_MAP })
    console.log('[normalize] staged counts:', JSON.stringify(counts))
  }

  // Stop at the gate (step 3)
  const gate = verifyGateLock(cfg)
  if (gate.ok) {
    console.log('\n✔ gate already locked — run import phases with --from schema --to redirects')
    process.exit(0)
  }
  console.log(`\n⛔ STOP — review gate (step 3): ${gate.reason}`)
  console.log('Next steps:')
  console.log(`  1. review / edit wp-archive/${cfg.site}/staged/ (see docs/wordpress-migration/runbook.md)`)
  console.log('  2. --gate lint    (must be clean)')
  console.log('  3. --gate lock    (editor approval → .gate-lock)')
  console.log('  4. --from schema --to redirects [--dry-run]  (import)')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
