// Copies every agent skill (`skills/<name>/SKILL.md`) from the repo into the package so
// `kcms setup ... --with-skill` works from an npm install. Runs before `tsc` in `pnpm build`.
// No hardcoded list: the repo's skills folder is the source of truth.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(pkg, '..', '..', 'skills')

const names = existsSync(source)
  ? readdirSync(source, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort()
  : []

if (names.length === 0) {
  console.error(`bundle-skill: no skills with SKILL.md found in ${source}`)
  process.exit(1)
}

rmSync(join(pkg, 'skills'), { recursive: true, force: true })
for (const name of names) {
  const target = join(pkg, 'skills', name)
  cpSync(join(source, name), target, { recursive: true })
  console.log(`bundle-skill: copied skills/${name} → ${target}`)
}
