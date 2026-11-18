import { getPayload } from 'payload'
import config from '../payload.config'

const TAG = '[seed:otahotel]'

async function main() {
  const payload = await getPayload({ config })

  // 1. Site
  let siteDoc = (
    await payload.find({
      collection: 'sites',
      where: { siteKey: { equals: 'otahotel' } },
      overrideAccess: true,
    })
  ).docs[0]

  if (!siteDoc) {
    siteDoc = await payload.create({
      collection: 'sites',
      data: {
        siteKey: 'otahotel',
        domain: 'otahotel.vn',
        defaultLanguage: 'vi',
        theme: 'light',
        knowledgeGraph: {
          type: 'Organization',
          businessType: 'ProfessionalService',
          name: 'Ota Hotel',
          description:
            'Giải pháp bán phòng OTA đa kênh cho khách sạn, villa, resort và homestay. Setup, tối ưu và vận hành Booking, Agoda, Airbnb, Expedia, Traveloka.',
          email: 'tranphuotahotel@gmail.com',
          telephone: '+84971551532',
          address: { addressCountry: 'VN' },
        },
        branding: { primaryColor: '#0ea5e9' },
      },
      overrideAccess: true,
    })
    console.log(`${TAG} created site (id ${siteDoc.id})`)
  } else {
    console.log(`${TAG} site exists (id ${siteDoc.id})`)
  }
  const tenantId = siteDoc.id

  // 2. Categories
  const categories = [
    { title: 'Kiến thức OTA', slug: 'kien-thuc-ota' },
    { title: 'Kinh nghiệm vận hành', slug: 'kinh-nghiem-van-hanh' },
    { title: 'Tin tức du lịch', slug: 'tin-tuc-du-lich' },
  ]
  const catIds: Record<string, number> = {}
  for (const cat of categories) {
    const existing = (
      await payload.find({
        collection: 'taxonomies',
        where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: cat.slug } }] },
        overrideAccess: true,
      })
    ).docs[0]
    if (existing) {
      catIds[cat.slug] = existing.id as number
      continue
    }
    const doc = await payload.create({
      collection: 'taxonomies',
      data: { tenant: tenantId, type: 'category', name: cat.title, slug: cat.slug },
      overrideAccess: true,
    })
    catIds[cat.slug] = doc.id as number
    console.log(`${TAG} created category "${cat.title}"`)
  }

  // 3. Posts
  const posts = [
    {
      title: '7 bước tối ưu Content Score trên Booking.com và Agoda',
      slug: 'toi-uu-content-score-booking-agoda',
      category: 'kien-thuc-ota',
      contentMd: `Content Score là chỉ số quan trọng quyết định thứ hạng hiển thị của khách sạn trên OTA.\n\n## Các bước tối ưu\n\n1. Bổ sung tối thiểu 24 hình ảnh chất lượng cao, đủ các hạng phòng.\n2. Viết mô tả chuẩn SEO, có từ khóa khu vực và tiện ích nổi bật.\n3. Khai báo đầy đủ tiện nghi (amenities) cho từng loại phòng.\n4. Cập nhật chính sách hủy, nhận/trả phòng rõ ràng.\n5. Thiết lập giá theo mùa và khuyến mãi phù hợp.\n6. Phản hồi 100% đánh giá của khách trong 24 giờ.\n7. Đồng bộ kho phòng qua Channel Manager để tránh overbooking.`,
    },
    {
      title: 'Chiến lược giá động (Dynamic Pricing) cho khách sạn nhỏ',
      slug: 'chien-luoc-gia-dong-khach-san-nho',
      category: 'kinh-nghiem-van-hanh',
      contentMd: `Dynamic Pricing giúp khách sạn tối đa doanh thu trên mỗi phòng (RevPAR) bằng cách điều chỉnh giá theo nhu cầu thị trường.\n\n- Theo dõi giá đối thủ trong bán kính 2km mỗi ngày.\n- Tăng giá vào cuối tuần, lễ Tết và mùa sự kiện.\n- Mở khuyến mãi Last-minute khi công suất dưới 60%.\n- Sử dụng Early Bird cho khách đặt trước 30 ngày.`,
    },
    {
      title: 'Bán tour trải nghiệm trên Klook, TripAdvisor: Nguồn thu mới cho khách sạn',
      slug: 'ban-tour-klook-tripadvisor',
      category: 'tin-tuc-du-lich',
      contentMd: `Ngoài doanh thu phòng, khách sạn có thể mở rộng nguồn thu từ tour và hoạt động trải nghiệm.\n\nCác nền tảng như Klook, TripAdvisor Experiences, Traveloka Xperience và Expedia Activities cho phép đăng bán tour với nội dung chuẩn quốc tế, đa ngôn ngữ, tiếp cận hàng triệu du khách.`,
    },
  ]
  for (const post of posts) {
    const existing = (
      await payload.find({
        collection: 'posts',
        where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: post.slug } }] },
        overrideAccess: true,
      })
    ).docs[0]
    if (existing) continue
    await payload.create({
      collection: 'posts',
      data: {
        tenant: tenantId,
        title: post.title,
        slug: post.slug,
        contentMd: post.contentMd,
        categories: catIds[post.category] ? [catIds[post.category]] : [],
        status: 'published',
        publishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    console.log(`${TAG} created post "${post.title}"`)
  }

  // 4. Services (products)
  const services = [
    {
      title: 'Setup & Tối ưu OTA',
      slug: 'setup-ota',
      price: 3000000,
      contentMd: `Đăng ký, cài đặt và tối ưu hình ảnh, nội dung chuẩn SEO trên tất cả các nền tảng OTA hàng đầu. Từ Agoda, Booking.com, Airbnb đến Expedia, Traveloka và nhiều sàn khác.\n\n- Đăng ký tài khoản trên các sàn OTA\n- Tối ưu hình ảnh và nội dung chuẩn SEO\n- Setup giá phòng chiến lược\n- Tối ưu Content Score đạt mức tối đa`,
    },
    {
      title: 'Bán Tour du lịch trên OTA',
      slug: 'ban-tour',
      price: 0,
      contentMd: `Mở rộng nguồn thu từ các hoạt động trải nghiệm du lịch. Đăng bán tour trên TripAdvisor, Klook, Traveloka Xperience và Expedia Activities với nội dung chuẩn quốc tế.\n\n- Đăng bán trên 4+ nền tảng tour hàng đầu\n- Nội dung chuẩn quốc tế, đa ngôn ngữ\n- Hình ảnh SEO-optimized chuyên nghiệp\n- Chăm sóc khách hàng sau tour`,
    },
    {
      title: 'Vận hành hàng tháng',
      slug: 'van-hanh-hang-thang',
      price: 2000000,
      contentMd: `Đội ngũ chuyên gia thay bạn quản lý toàn diện kho phòng, giá cả và khuyến mãi trên tất cả các kênh OTA. Tiết kiệm hơn 10 triệu đồng so với tuyển nhân sự.\n\n- Quản lý toàn bộ kho phòng\n- Chiến lược giá động (Dynamic Pricing)\n- Chạy khuyến mãi theo mùa\n- Báo cáo doanh thu định kỳ`,
    },
  ]
  for (const s of services) {
    const existing = (
      await payload.find({
        collection: 'products',
        where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: s.slug } }] },
        overrideAccess: true,
      })
    ).docs[0]
    if (existing) continue
    await payload.create({
      collection: 'products',
      data: {
        tenant: tenantId,
        title: s.title,
        slug: s.slug,
        contentMd: s.contentMd,
        status: 'published',
        publishedAt: new Date().toISOString(),
        prices: [{ originalPrice: s.price, currentPrice: s.price, currency: 'VND' }],
      },
      overrideAccess: true,
    })
    console.log(`${TAG} created service "${s.title}"`)
  }

  console.log(`${TAG} Done. tenantId=${tenantId}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
