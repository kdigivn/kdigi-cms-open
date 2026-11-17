import re

path = "/home/trigcomvn/trig.com.vn/index.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Desktop Menu
desktop_old = '<a href="#process" class="text-sm font-medium text-slate-600 hover:text-primary-500 transition-colors duration-200 cursor-pointer">Quy trình</a>'
desktop_new = '<a href="#process" class="text-sm font-medium text-slate-600 hover:text-primary-500 transition-colors duration-200 cursor-pointer">Quy trình</a>\n                    <a href="#news" class="text-sm font-medium text-slate-600 hover:text-primary-500 transition-colors duration-200 cursor-pointer">Tin tức</a>'

# 2. Update Mobile Menu
mobile_old = '<a href="#process" class="text-sm font-medium text-slate-600 hover:text-primary-500 py-2 transition-colors duration-200 cursor-pointer">Quy trình</a>'
mobile_new = '<a href="#process" class="text-sm font-medium text-slate-600 hover:text-primary-500 py-2 transition-colors duration-200 cursor-pointer">Quy trình</a>\n                    <a href="#news" class="text-sm font-medium text-slate-600 hover:text-primary-500 py-2 transition-colors duration-200 cursor-pointer">Tin tức</a>'

# 3. Add id="services-grid"
grid_old = '<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">'
grid_new = '<div id="services-grid" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">'

# 4. Insert News section and Modal before contact
contact_old = '<!-- CTA SECTION -->'
news_section = """<!-- ============================================ -->
        <!-- NEWS / BLOG SECTION (KDIGI CMS INTEGRATION) -->
        <!-- ============================================ -->
        <section id="news" class="py-20 lg:py-28 bg-slate-50/70">
            <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div class="text-center max-w-2xl mx-auto mb-16 fade-in">
                    <span class="inline-block text-primary-500 text-sm font-semibold mb-3">Góc nhìn &amp; Tin tức KDIGI CMS</span>
                    <h2 class="font-heading font-bold text-3xl sm:text-4xl text-slate-900 mb-4">
                        Kiến trúc Công nghệ &amp; Đổi mới sáng tạo
                    </h2>
                    <p class="text-slate-500 leading-relaxed">
                        Nội dung và bài viết chuyên sâu được quản trị trực tiếp từ hệ thống KDIGI CMS.
                    </p>
                </div>

                <div id="cms-posts-container" class="grid md:grid-cols-3 gap-8">
                    <!-- Hydrated dynamically from KDIGI CMS -->
                    <div class="col-span-full text-center py-12 text-slate-400 text-sm">
                        Đang đồng bộ dữ liệu bài viết từ KDIGI CMS...
                    </div>
                </div>
            </div>
        </section>

        <!-- CMS Article Detail Modal -->
        <div id="cms-detail-modal" class="fixed inset-0 z-50 hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
            <div class="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 relative">
                <button id="cms-modal-close" class="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer" aria-label="Đóng">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
                <div class="flex items-center gap-3 mb-3">
                    <span id="cms-modal-category" class="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-50 text-primary-600"></span>
                    <span id="cms-modal-date" class="text-xs text-slate-400"></span>
                </div>
                <h3 id="cms-modal-title" class="font-heading font-bold text-2xl text-slate-900 mb-4"></h3>
                <div id="cms-modal-content" class="text-slate-600 leading-relaxed space-y-4"></div>
            </div>
        </div>

        <!-- ============================================ -->
        <!-- CTA SECTION -->"""

# 5. Update Zalo link in footer
zalo_old = '<a href="#" class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-primary-500 transition-colors duration-200 cursor-pointer" aria-label="Zalo">'
zalo_new = '<a href="https://zalo.me/3972600953931944918" target="_blank" rel="noopener noreferrer" class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-primary-500 transition-colors duration-200 cursor-pointer" aria-label="Zalo OA XOX">'

content = content.replace(desktop_old, desktop_new, 1)
content = content.replace(mobile_old, mobile_new, 1)
content = content.replace(grid_old, grid_new, 1)
content = content.replace(contact_old, news_section, 1)
content = content.replace(zalo_old, zalo_new, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("PATCH_APPLIED_SUCCESSFULLY")
