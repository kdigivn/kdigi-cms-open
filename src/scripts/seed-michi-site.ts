import { getPayload } from 'payload'
import config from '../payload.config'
import fs from 'fs'
import path from 'path'

const TAG = '[seed:michi]'

async function main() {
  const payload = await getPayload({ config })

  // 1. Check or Create Site "michi"
  let siteDoc = (
    await payload.find({
      collection: 'sites',
      where: { siteKey: { equals: 'michi' } },
      overrideAccess: true,
    })
  ).docs[0]

  const siteData: any = {
    siteKey: 'michi',
    domain: 'michi.restaurant',
    defaultLanguage: 'vi',
    theme: 'light',
    branding: {
      primaryColor: '#16301A',
      fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    knowledgeGraph: {
      type: 'Organization',
      businessType: 'Restaurant',
      name: {
        vi: 'Michi Restaurant — Hương vị Việt Nam',
        en: 'Michi Restaurant — A Taste of Vietnam',
      },
      legalName: {
        vi: 'Michi Restaurant',
        en: 'Michi Restaurant',
      },
      description: {
        vi: 'Nhà hàng ẩm thực Việt Nam tại Blackfalds, Alberta, Canada. Phở truyền thống, Bún chả, Bún bò Huế, Bánh mì và Cà phê Việt Nam.',
        en: 'Authentic Vietnamese restaurant in Blackfalds, Alberta. Serving traditional Phở, Bún chả, Bún bò Huế, Bánh mì and Vietnamese coffee.',
      },
      email: 'michi.canada.restaurant@gmail.com',
      telephone: '+14036003938',
      priceRange: '$$',
      address: {
        streetAddress: '4914 Broadway Ave',
        addressLocality: 'Blackfalds',
        addressRegion: 'AB',
        postalCode: 'T0M 0J0',
        addressCountry: 'CA',
      },
      geo: {
        latitude: 52.3833,
        longitude: -113.7833,
      },
      openingHours: [
        {
          dayOfWeek: ['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
          opens: '11:00',
          closes: '20:30',
        },
      ],
    },
    socialProfiles: [
      {
        platform: 'Instagram',
        url: 'https://instagram.com/michi.canada',
      },
    ],
    contact: {
      rightSide: [
        {
          label: { vi: 'Gọi hotline', en: 'Call Hotline' },
          icon: 'phone',
          value: '403 600 3938',
          url: 'tel:+14036003938',
          isVisible: true,
        },
        {
          label: { vi: 'Chỉ đường Google Maps', en: 'Google Maps Directions' },
          icon: 'map',
          value: '4914 Broadway Ave, Blackfalds, AB',
          url: 'https://maps.google.com/?q=4914+Broadway+Ave,+Blackfalds,+AB+T0M+0J0',
          isVisible: true,
        },
      ],
    },
  }

  if (!siteDoc) {
    siteDoc = await payload.create({
      collection: 'sites',
      data: siteData,
      overrideAccess: true,
    })
    console.log(`${TAG} Created site "michi" (id ${siteDoc.id})`)
  } else {
    siteDoc = await payload.update({
      collection: 'sites',
      id: siteDoc.id,
      data: siteData,
      overrideAccess: true,
    })
    console.log(`${TAG} Updated site "michi" (id ${siteDoc.id})`)
  }

  const tenantId = siteDoc.id

  // 2. Author
  let author = (
    await payload.find({
      collection: 'authors',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: 'michi-team' } }] },
      overrideAccess: true,
    })
  ).docs[0]
  if (!author) {
    author = await payload.create({
      collection: 'authors',
      data: {
        tenant: tenantId,
        name: 'Michi Culinary Team',
        slug: 'michi-team',
        bio: 'Bếp trưởng & đội ngũ sáng lập Michi Restaurant — Hương vị Việt Nam tại Blackfalds, Alberta.',
      },
      overrideAccess: true,
    })
    console.log(`${TAG} Created author (id ${author.id})`)
  }

  // 3. Taxonomies (Product Categories)
  const categoriesDef = [
    {
      slug: 'khai-vi',
      name: { vi: 'Khai vị', en: 'Appetizers' },
      description: {
        vi: 'Các món khai vị tươi ngon chuẩn vị truyền thống Việt Nam',
        en: 'Fresh and traditional Vietnamese appetizers',
      },
    },
    {
      slug: 'mon-chinh',
      name: { vi: 'Món chính', en: 'Main Dishes' },
      description: {
        vi: 'Phở bò, Bún bò Huế, Bún chả Hà Nội nấu từ nước dùng ninh xương đậm đà mỗi ngày',
        en: 'Traditional Phở, Spicy Beef Noodle Soup, Hanoi Grilled Pork simmered daily',
      },
    },
    {
      slug: 'banh-mi',
      name: { vi: 'Bánh Mì Việt Nam', en: 'Vietnamese Bánh Mì' },
      description: {
        vi: 'Bánh mì giòn rụm kẹp thịt nướng than hoa, pate béo ngậy và đồ chua',
        en: 'Crispy baguette filled with savory meats, pate and pickled vegetables',
      },
    },
    {
      slug: 'combos',
      name: { vi: 'Phần ăn kết hợp', en: 'Combos' },
      description: {
        vi: 'Combo tô lớn kèm gỏi cuốn tùy chọn tiết kiệm và đủ đầy',
        en: 'Generous noodle bowl combos paired with delicious salad rolls',
      },
    },
    {
      slug: 'do-uong',
      name: { vi: 'Đồ uống & Tráng miệng', en: 'Beverages' },
      description: {
        vi: 'Cà phê Việt Nam pha phin truyền thống, trà hoa quả tươi mát và trà mật ong ấm',
        en: 'Traditional Vietnamese drip coffee, iced fruit teas and comforting warm teas',
      },
    },
  ]

  const catMap: Record<string, number> = {}
  for (const cat of categoriesDef) {
    let existing = (
      await payload.find({
        collection: 'taxonomies',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { slug: { equals: cat.slug } },
            { type: { equals: 'product-category' } },
          ],
        },
        overrideAccess: true,
      })
    ).docs[0]

    if (!existing) {
      existing = await payload.create({
        collection: 'taxonomies',
        data: {
          tenant: tenantId,
          type: 'product-category',
          name: cat.name.vi,
          slug: cat.slug,
          description: cat.description.vi,
        } as any,
        overrideAccess: true,
      })
      console.log(`${TAG} Created taxonomy "${cat.name.vi}" (id ${existing.id})`)
    }
    catMap[cat.slug] = existing.id
  }

  // 4. Products (Dishes)
  // Read menu_data.json
  const menuPath = path.resolve(process.cwd(), '../minchi-website/menu_data.json')
  let rawMenu: any[] = []
  if (fs.existsSync(menuPath)) {
    rawMenu = JSON.parse(fs.readFileSync(menuPath, 'utf-8'))
  }

  const categorySlugMap: Record<number, string> = {
    0: 'khai-vi',
    1: 'mon-chinh',
    2: 'banh-mi',
    3: 'combos',
    4: 'do-uong',
  }

  let totalProducts = 0
  for (let catIdx = 0; catIdx < rawMenu.length; catIdx++) {
    const group = rawMenu[catIdx]
    const catSlug = categorySlugMap[catIdx]
    const taxonomyId = catMap[catSlug]

    for (const item of group.items) {
      // Determine numeric price
      let numPrice = 0
      const rawPrice = item.price
      if (typeof rawPrice === 'string' && rawPrice.startsWith('$')) {
        numPrice = parseFloat(rawPrice.replace('$', '')) || 0
      }

      // Generate clean slug from item code or name
      const codeMatch = item.name.vi.match(/^([A-Z][0-9]+)\.\s*(.*)/)
      const code = codeMatch ? codeMatch[1].toLowerCase() : ''
      const namePart = codeMatch ? codeMatch[2] : item.name.vi
      const slug = (
        code
          ? `${code}-${namePart}`
          : namePart
      )
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      const title = {
        vi: item.name.vi,
        en: item.name.en || item.name.vi,
      }

      const excerpt = {
        vi: item.d?.vi || '',
        en: item.d?.en || '',
      }

      const contentMd = {
        vi: `### ${item.name.vi}\n\n${item.d?.vi || ''}\n\n- **Giá niêm yết:** $${numPrice.toFixed(2)} CAD\n- **Phục vụ:** Thưởng thức tại quán (Dine In) & Đặt mang về (Take Out)`,
        en: `### ${item.name.en || item.name.vi}\n\n${item.d?.en || ''}\n\n- **Price:** $${numPrice.toFixed(2)} CAD\n- **Service:** Dine In & Take Out`,
      }

      let existingProduct = (
        await payload.find({
          collection: 'products',
          where: {
            and: [
              { tenant: { equals: tenantId } },
              { slug: { equals: slug } },
            ],
          },
          overrideAccess: true,
        })
      ).docs[0]

      const productPayload: any = {
        tenant: tenantId,
        title,
        slug,
        status: 'published',
        publishedAt: new Date().toISOString(),
        categories: taxonomyId ? [taxonomyId] : [],
        author: author.id,
        excerpt,
        contentMd,
        prices: [
          {
            originalPrice: numPrice,
            currentPrice: numPrice,
            currency: 'CAD',
          },
        ],
      }

      if (!existingProduct) {
        existingProduct = await payload.create({
          collection: 'products',
          data: productPayload,
          overrideAccess: true,
        })
        console.log(`  + Created product "${title.vi}" ($${numPrice} CAD) -> slug: ${slug}`)
      } else {
        existingProduct = await payload.update({
          collection: 'products',
          id: existingProduct.id,
          data: productPayload,
          overrideAccess: true,
        })
        console.log(`  ~ Updated product "${title.vi}" -> slug: ${slug}`)
      }
      totalProducts++
    }
  }

  // 5. Story Page ("Câu chuyện Michi")
  let storyPage = (
    await payload.find({
      collection: 'pages',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { slug: { equals: 'cau-chuyen-michi' } },
        ],
      },
      overrideAccess: true,
    })
  ).docs[0]

  const storyContentVi = `## Câu chuyện Michi — Hương vị Việt Nam tại Blackfalds

Câu chuyện của tôi không bắt đầu từ những công thức rập khuôn, mà được viết từ ký ức, tình yêu, lòng đam mê ẩm thực và một hành trình dài vượt vạn dặm xa.

Tuổi thơ tôi là những ngày tháng được sưởi ấm bởi hương vị đậm đà từ gian bếp của mẹ. Với tôi mỗi món ăn chính là một lời tâm tình, một vị đại sứ thầm lặng mang nét đẹp tâm hồn Việt ra thế giới.

Hành trình dài gần 10 năm ấp ủ và giờ đây giấc mơ mở một nhà hàng Việt Nam trên đất Canada đã thành hiện thực.

Nhà hàng Michi — Hương vị Việt Nam tại Blackfalds chính là chương mới trong cuộc đời tôi. Bằng tất cả tình yêu, niềm đam mê và sự thấu hiểu về các món ăn truyền thống cùng kinh nghiệm 16 năm xây dựng, quản lý chuỗi siêu thị thực phẩm hữu cơ, tôi mong muốn mang đến cho thực khách Canada một không gian ẩm thực rất Việt Nam.

Tại Michi, mỗi món ăn đều là sự chắt lọc tinh hoa từ sự học hỏi, kinh nghiệm và lòng đam mê. Tôi tin rằng, hương vị chân thực và sự tận tâm từ trái tim sẽ chạm đến giác quan của mọi thực khách.

Hãy thưởng thức những món ăn thuần Việt trong không gian giao thoa văn hóa đầy cảm xúc này!`

  const storyContentEn = `## The Michi Story — A Taste of Vietnam in Blackfalds

My story doesn't begin with rigid recipes — it is written from memories, love, a passion for cooking, and a journey of many thousands of miles.

My childhood was warmed by the rich flavors of my mother's kitchen. To me, every dish is a quiet confession — a silent ambassador carrying the beauty of the Vietnamese soul out into the world.

After nearly ten years of dreaming, my wish to open a Vietnamese restaurant in Canada has finally come true.

Michi — A Taste of Vietnam in Blackfalds is the newest chapter of my life. With all my love, passion and understanding of traditional Vietnamese cooking, and 16 years of building and managing an organic food supermarket chain, I hope to bring Canadian diners a dining space that is truly Vietnamese.

At Michi, every dish distills what I have learned, lived and loved. I believe that honest flavors and wholehearted care will reach every guest.

Come savor authentic Vietnamese food in this heartfelt space where two cultures meet!`

  const pagePayload: any = {
    tenant: tenantId,
    title: {
      vi: 'Câu chuyện Michi',
      en: 'The Michi Story',
    },
    slug: 'cau-chuyen-michi',
    status: 'published',
    publishedAt: new Date().toISOString(),
    contentMd: {
      vi: storyContentVi,
      en: storyContentEn,
    },
    excerpt: {
      vi: 'Hành trình mang tinh hoa ẩm thực truyền thống Việt Nam đến thị trấn Blackfalds, Alberta.',
      en: 'A journey bringing traditional Vietnamese culinary heritage to Blackfalds, Alberta.',
    },
  }

  if (!storyPage) {
    storyPage = await payload.create({
      collection: 'pages',
      data: pagePayload,
      overrideAccess: true,
    })
    console.log(`${TAG} Created page "cau-chuyen-michi" (id ${storyPage.id})`)
  } else {
    storyPage = await payload.update({
      collection: 'pages',
      id: storyPage.id,
      data: pagePayload,
      overrideAccess: true,
    })
    console.log(`${TAG} Updated page "cau-chuyen-michi" (id ${storyPage.id})`)
  }

  console.log(`${TAG} Seed hoàn tất thành công! Tenant ID: ${tenantId}, Tổng số món đã nạp: ${totalProducts}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(`${TAG} Lỗi seed:`, err)
  process.exit(1)
})
