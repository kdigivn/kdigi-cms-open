import { getPayload } from 'payload'
import config from '../payload.config'
import fs from 'fs'
import path from 'path'

const TAG = '[seed:sinhduoc]'

async function main() {
  const payload = await getPayload({ config })

  // 1. Check or Create Site
  let siteDoc = (
    await payload.find({
      collection: 'sites',
      where: { siteKey: { equals: 'sinhduoc' } },
      overrideAccess: true,
    })
  ).docs[0]

  if (!siteDoc) {
    siteDoc = await payload.create({
      collection: 'sites',
      data: {
        siteKey: 'sinhduoc',
        domain: 'sinhduoc.vn',
        defaultLanguage: 'vi',
        theme: 'light',
        knowledgeGraph: {
          type: 'Organization',
          businessType: 'Organization',
          name: 'Hợp tác xã Sinh Dược',
          legalName: 'Hợp tác xã Sinh Dược',
          description:
            'Tự nhiên là tốt nhất - Chuyên các sản phẩm xà bông, muối tắm thảo dược và dược liệu tự nhiên bản địa Ninh Bình.',
          email: 'sinhduoc.vn@gmail.com',
          telephone: '0789098777',
          address: {
            streetAddress: 'Xóm 4, Gia Sinh',
            addressLocality: 'Gia Viễn',
            addressRegion: 'Ninh Bình',
            addressCountry: 'VN',
          },
        },
        branding: {
          primaryColor: '#16a34a',
        },
      },
      overrideAccess: true,
    })
    console.log(`${TAG} created site "sinhduoc" (id ${siteDoc.id})`)
  } else {
    console.log(`${TAG} site "sinhduoc" already exists (id ${siteDoc.id})`)
  }

  const tenantId = siteDoc.id

  // 2. Author
  let author = (
    await payload.find({
      collection: 'authors',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: 'sinh-duoc' } }] },
      overrideAccess: true,
    })
  ).docs[0]
  if (!author) {
    author = await payload.create({
      collection: 'authors',
      data: {
        tenant: tenantId,
        name: 'Sinh Dược',
        slug: 'sinh-duoc',
        bio: 'Hợp tác xã Sinh Dược - Tự nhiên là tốt nhất',
      },
      overrideAccess: true,
    })
    console.log(`${TAG} created author (id ${author.id})`)
  }

  // 3. Categories
  const categories = [
    { title: 'Tin tức họat động', slug: 'tin-tuc-hoat-dong' },
    { title: 'Góc chia sẻ', slug: 'goc-chia-se' },
    { title: 'Thông tin sản phẩm', slug: 'thong-tin-san-pham' },
  ]
  const catIds: Record<string, number> = {}
  for (const cat of categories) {
    let existing = (
      await payload.find({
        collection: 'taxonomies',
        where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: cat.slug } }] },
        overrideAccess: true,
      })
    ).docs[0]
    if (!existing) {
      existing = await payload.create({
        collection: 'taxonomies',
        data: {
          tenant: tenantId,
          type: 'category',
          title: cat.title,
          slug: cat.slug,
        },
        overrideAccess: true,
      })
      console.log(`${TAG} created category "${cat.title}" (id ${existing.id})`)
    }
    catIds[cat.slug] = existing.id
  }

  // 4. Staged import if available
  const stagedDir = path.resolve(process.cwd(), 'wp-archive/sinhduoc/staged')
  if (fs.existsSync(stagedDir)) {
    console.log(`${TAG} staged archive found at ${stagedDir}`)
  }

  console.log(`${TAG} Done. tenantId=${tenantId}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
