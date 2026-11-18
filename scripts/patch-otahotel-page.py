path = '/Users/trinhhao/Antigravity/ota-hotel/app/[locale]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

import_target = "import Navbar from '@/app/components/layout/Navbar';"
new_imports = """import Navbar from '@/app/components/layout/Navbar';
import Link from 'next/link';
import { getCmsPosts } from '@/lib/cms';"""

if import_target in c:
    c = c.replace(import_target, new_imports, 1)

fetch_target = "const dict = await getDictionary(locale as Locale);"
new_fetch = """const dict = await getDictionary(locale as Locale);
  const posts = await getCmsPosts(3);"""

if fetch_target in c:
    c = c.replace(fetch_target, new_fetch, 1)

faq_target = "{/* FAQ Section */}"
news_section = """{/* News & Insights Section (KDIGI CMS Integration) */}
      <section className="py-20 lg:py-28 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <span className="text-primary font-semibold text-sm">
                {locale === 'vi' ? 'Quản trị từ KDIGI CMS' : 'Managed via KDIGI CMS'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mt-2">
                {locale === 'vi' ? 'Góc nhìn & Kiến thức OTA' : 'OTA Insights & News'}
              </h2>
            </div>
            <Link
              href={`/${locale}/tin-tuc`}
              className="mt-4 md:mt-0 text-primary font-semibold hover:underline inline-flex items-center gap-1"
            >
              {locale === 'vi' ? 'Xem tất cả bài viết' : 'View all articles'} &rarr;
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {posts.map((post) => (
              <article
                key={post.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-gray-100 p-6 flex flex-col justify-between hover:shadow-xl hover:border-primary/30 transition-all duration-300"
              >
                <div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    {post.categories?.[0]?.name || (locale === 'vi' ? 'Kiến thức OTA' : 'OTA Guide')}
                  </span>
                  <h3 className="text-xl font-bold text-foreground mt-4 mb-3 leading-snug">
                    <Link href={`/${locale}/tin-tuc/${post.slug}`} className="hover:text-primary transition-colors">
                      {post.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed mb-6">
                    {post.excerpt || post.contentMd?.slice(0, 140) || ''}
                  </p>
                </div>
                <Link
                  href={`/${locale}/tin-tuc/${post.slug}`}
                  className="text-sm font-semibold text-primary inline-flex items-center gap-1 hover:translate-x-1 transition-transform"
                >
                  {locale === 'vi' ? 'Đọc tiếp' : 'Read more'} &rarr;
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}"""

if faq_target in c:
    c = c.replace(faq_target, news_section, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('PAGE_PATCHED_OK')
