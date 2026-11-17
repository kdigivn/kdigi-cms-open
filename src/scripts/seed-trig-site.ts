import { getPayload } from 'payload'
import config from '../payload.config'

async function main() {
  const payload = await getPayload({ config })

  // 1. Check or Create Site
  let siteDoc = (await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: 'trig' } },
    overrideAccess: true,
  })).docs[0]

  if (!siteDoc) {
    siteDoc = await payload.create({
      collection: 'sites',
      data: {
        siteKey: 'trig',
        domain: 'trig.com.vn',
        defaultLanguage: 'vi',
        theme: 'light',
        knowledgeGraph: {
          type: 'Organization',
          businessType: 'ProfessionalService',
          name: 'Trig',
          legalName: 'CÔNG TY TNHH DỊCH VỤ VÀ ĐẦU TƯ SONG AN',
          description: 'Giải pháp phần mềm thông minh cho doanh nghiệp nhỏ và vừa Việt Nam. Gia công phần mềm, phát triển ứng dụng, tư vấn chuyển đổi số.',
          email: 'hi@trig.vn',
          telephone: '+84938356879',
          taxId: '0110660880',
          address: {
            streetAddress: 'Số 87 ngõ 1194 đường Láng, Phường Láng',
            addressLocality: 'Hà Nội',
            addressCountry: 'VN',
          },
        },
        branding: {
          primaryColor: '#2563eb',
        },
      },
      overrideAccess: true,
    })
    console.log(`[seed:trig] created site "trig" (id ${siteDoc.id})`)
  } else {
    console.log(`[seed:trig] site "trig" already exists (id ${siteDoc.id})`)
  }

  const tenantId = siteDoc.id

  // 2. Categories
  const categories = [
    { title: 'Giải pháp phần mềm', slug: 'giai-phap-phan-mem' },
    { title: 'Chuyển đổi số', slug: 'chuyen-doi-so' },
    { title: 'Tin tức & Công nghệ', slug: 'tin-tuc-cong-nghe' },
  ]
  const createdCats: Record<string, number> = {}
  for (const cat of categories) {
    const existing = (await payload.find({
      collection: 'taxonomies',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: cat.slug } }] },
      overrideAccess: true,
    })).docs[0]
    if (!existing) {
      const doc = await payload.create({
        collection: 'taxonomies',
        data: {
          tenant: tenantId,
          type: 'category',
          name: cat.title,
          slug: cat.slug,
        },
        overrideAccess: true,
      })
      createdCats[cat.slug] = doc.id
      console.log(`[seed:trig] created category "${cat.title}"`)
    } else {
      createdCats[cat.slug] = existing.id
    }
  }

  // 3. Pages
  const pages = [
    {
      title: 'Trang chủ - Trig',
      slug: 'trang-chu',
      contentMd: `# Trig — Giải pháp phần mềm thông minh cho doanh nghiệp\n\nĐối tác công nghệ đáng tin cậy cho doanh nghiệp nhỏ và vừa tại Việt Nam. Chúng tôi cung cấp các giải pháp gia công phần mềm, phát triển ứng dụng web, mobile app và tư vấn chuyển đổi số toàn diện.\n\n## Dịch vụ cốt lõi\n\n- **Gia công phần mềm theo yêu cầu:** Thiết kế kiến trúc tối ưu, bảo mật cao và dễ dàng mở rộng.\n- **Ứng dụng Web & Mobile:** Trải nghiệm người dùng mượt mà, tối ưu hiệu năng trên iOS, Android và Web.\n- **Hệ thống ERP & CRM:** Quản lý quy trình bán hàng, kho vận, nhân sự và tài chính tập trung.\n- **Tư vấn chuyển đổi số:** Đồng hành cùng doanh nghiệp xây dựng lộ trình số hóa hiệu quả.\n\n## Liên hệ hợp tác\n\n- **Email:** hi@trig.vn\n- **Hotline:** 0938 356 879\n- **Địa chỉ:** Số 87 ngõ 1194 đường Láng, Đống Đa, Hà Nội`,
    },
    {
      title: 'Giới thiệu về Trig',
      slug: 'gioi-thieu',
      contentMd: `# Giới thiệu về Trig (Song An)\n\nCông ty TNHH Dịch vụ và Đầu tư Song An (thương hiệu Trig) được thành lập với sứ mệnh mang công nghệ thông tin tiên tiến đến với mọi doanh nghiệp nhỏ và vừa tại Việt Nam.\n\nĐội ngũ kỹ sư của Trig có nhiều năm kinh nghiệm thực chiến trong các dự án quy mô lớn, luôn đặt chất lượng sản phẩm và tính ổn định lên hàng đầu.`,
    },
    {
      title: 'Liên hệ',
      slug: 'lien-he',
      contentMd: `# Thông tin liên hệ\n\n- **Tên công ty:** CÔNG TY TNHH DỊCH VỤ VÀ ĐẦU TƯ SONG AN\n- **Mã số thuế:** 0110660880\n- **Văn phòng:** Số 87 ngõ 1194 đường Láng, Phường Láng, Hà Nội\n- **Hotline hỗ trợ:** 0938 356 879\n- **Hòm thư:** hi@trig.vn`,
    },
  ]

  for (const page of pages) {
    const existing = (await payload.find({
      collection: 'pages',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: page.slug } }] },
      overrideAccess: true,
    })).docs[0]
    if (!existing) {
      await payload.create({
        collection: 'pages',
        data: {
          tenant: tenantId,
          title: page.title,
          slug: page.slug,
          contentMd: page.contentMd,
          status: 'published',
          publishedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
      console.log(`[seed:trig] created page "${page.title}"`)
    }
  }

  // 4. Posts
  const posts = [
    {
      title: 'Gia công phần mềm theo yêu cầu: Khi nào doanh nghiệp nên bắt đầu?',
      slug: 'gia-cong-phan-mem-theo-yeu-cau-cho-doanh-nghiep',
      category: 'giai-phap-phan-mem',
      contentMd: `Xây dựng một hệ thống phần mềm riêng biệt là bước đi chiến lược giúp doanh nghiệp tự động hóa các quy trình độc thù mà các phần mềm đóng gói sẵn trên thị trường không đáp ứng được.\n\n### Lợi ích khi phát triển phần mềm riêng:\n1. Tối ưu 100% theo luồng nghiệp vụ thực tế.\n2. Kiểm soát dữ liệu và bảo mật tuyệt đối.\n3. Linh hoạt mở rộng tính năng theo sự phát triển của công ty.`,
    },
    {
      title: 'Xu hướng chuyển đổi số cho doanh nghiệp vừa và nhỏ năm 2026',
      slug: 'xu-huong-chuyen-doi-so-2026',
      category: 'chuyen-doi-so',
      contentMd: `Chuyển đổi số không đơn thuần là số hóa tài liệu giấy, mà là chuyển dịch tư duy vận hành dựa trên dữ liệu thời gian thực và tự động hóa với AI Agent.\n\nDoanh nghiệp cần bắt đầu từ những khâu có hiệu quả tức thì: quản lý khách hàng (CRM), xuất hóa đơn điện tử, và quản lý kho vận thông minh.`,
    },
    {
      title: 'Hệ sinh thái công nghệ Trig: Tốc độ, Ổn định và Bảo mật cao',
      slug: 'he-sinh-thai-cong-nghe-trig',
      category: 'tin-tuc-cong-nghe',
      contentMd: `Tại Trig, chúng tôi ứng dụng các công nghệ hiện đại nhất như Next.js 15, Node.js, Go, Flutter, PostgreSQL và giao thức AI-native MCP để xây dựng các giải pháp bền vững cho đối tác.`,
    },
  ]

  for (const post of posts) {
    const existing = (await payload.find({
      collection: 'posts',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: post.slug } }] },
      overrideAccess: true,
    })).docs[0]
    if (!existing) {
      const catId = createdCats[post.category]
      await payload.create({
        collection: 'posts',
        data: {
          tenant: tenantId,
          title: post.title,
          slug: post.slug,
          contentMd: post.contentMd,
          categories: catId ? [catId] : [],
          status: 'published',
          publishedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
      console.log(`[seed:trig] created post "${post.title}"`)
    }
  }

  // 5. Products / Services
  const services = [
    {
      title: 'Dịch vụ Gia công Phần mềm Theo Yêu cầu',
      slug: 'gia-cong-phan-mem',
      contentMd: `Phát triển hệ thống phần mềm backend, web portal, API nội bộ được thiết kế may đo riêng theo yêu cầu cụ thể của từng doanh nghiệp.`,
      price: 0,
    },
    {
      title: 'Phát triển Ứng dụng Di động iOS & Android',
      slug: 'phat-trien-mobile-app',
      contentMd: `Thiết kế UI/UX hiện đại, lập trình ứng dụng native và cross-platform (React Native/Flutter) với hiệu năng cao và độ mượt tối ưu.`,
      price: 0,
    },
    {
      title: 'Triển khai Hệ thống Quản trị Doanh nghiệp ERP & CRM',
      slug: 'trien-khai-erp-crm',
      contentMd: `Giải pháp chuyển đổi số toàn diện: số hóa quy trình kinh doanh, quản lý kho hàng, kế toán tài chính và chăm sóc khách hàng tự động.`,
      price: 0,
    },
    {
      title: 'Tư vấn Kiến trúc Kỹ thuật & Chuyển đổi số',
      slug: 'tu-van-chuyen-doi-so',
      contentMd: `Khảo sát hiện trạng, tư vấn lựa chọn công nghệ, thiết kế kiến trúc đám mây và đồng hành triển khai cùng đội ngũ kỹ thuật của đối tác.`,
      price: 0,
    },
  ]

  for (const s of services) {
    const existing = (await payload.find({
      collection: 'products',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: s.slug } }] },
      overrideAccess: true,
    })).docs[0]
    if (!existing) {
      await payload.create({
        collection: 'products',
        data: {
          tenant: tenantId,
          title: s.title,
          slug: s.slug,
          contentMd: s.contentMd,
          status: 'published',
          publishedAt: new Date().toISOString(),
          prices: [{ originalPrice: s.price || 0, currentPrice: s.price || 0, currency: 'VND' }],
        },
        overrideAccess: true,
      })
      console.log(`[seed:trig] created service/product "${s.title}"`)
    }
  }

  console.log('[seed:trig] Done! Website trig.com.vn is ready on KDIGI CMS.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
