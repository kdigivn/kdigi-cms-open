#!/usr/bin/env node
/**
 * Create (or reset) a super-admin user for local login.
 * Idempotent — updates the password+role if the email already exists.
 *
 * Usage: node --env-file=.env --import tsx src/scripts/create-admin-user.ts <email> <password>
 */
import { getPayload } from 'payload'
import config from '../payload.config'

async function main() {
  const email = process.argv[process.argv.length - 2]
  const password = process.argv[process.argv.length - 1]
  if (!email?.includes('@') || !password || password.length < 8) {
    console.error('Usage: ... create-admin-user.ts <email> <password(>=8 chars)>')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { password, role: 'super-admin' },
      overrideAccess: true,
    })
    console.log(`Updated existing user ${email} → super-admin, password reset`)
  } else {
    await payload.create({
      collection: 'users',
      data: { email, password, role: 'super-admin' },
      overrideAccess: true,
    })
    console.log(`Created super-admin ${email}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
