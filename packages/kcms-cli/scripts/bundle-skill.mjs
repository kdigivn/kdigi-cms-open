// Copies the repo's agent skill (skills/kcms) into the package so `kcms setup --with-skill`
// works from an npm install. Runs before `tsc` in `pnpm build`.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(pkg, '..', '..', 'skills', 'kcms')
const target = join(pkg, 'skills', 'kcms')

if (!existsSync(source)) {
  console.error(`bundle-skill: ${source} not found`)
  process.exit(1)
}
rmSync(join(pkg, 'skills'), { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log(`bundle-skill: copied skills/kcms → ${target}`)
