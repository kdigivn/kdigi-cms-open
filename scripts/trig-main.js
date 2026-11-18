/* ============================================
   TRIG - Main JavaScript with KDIGI CMS Integration
   ============================================ */

const CMS_CONFIG = {
    baseUrl: 'https://cms.xox.vn',
    tenantId: 3, // Tenant TRIG
};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // ---- Mobile Menu ----
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });

        // Close mobile menu when clicking a link
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });
    }

    // ---- Navbar Scroll Effect ----
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }, { passive: true });
    }

    // ---- Fade-in on Scroll (IntersectionObserver) ----
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
        const fadeElements = document.querySelectorAll('.fade-in');

        const fadeObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    fadeObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        fadeElements.forEach(el => fadeObserver.observe(el));
    } else {
        document.querySelectorAll('.fade-in').forEach(el => {
            el.classList.add('visible');
        });
    }

    // ---- Contact Form Submission (Formspree) ----
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');
    const submitBtn = document.getElementById('contact-submit');

    if (contactForm && formStatus && submitBtn) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate phone format
            const phoneEl = document.getElementById('phone');
            const phone = phoneEl ? phoneEl.value.replace(/\s/g, '') : '';
            if (!/^[0-9]{9,15}$/.test(phone)) {
                showFormStatus('Số điện thoại không hợp lệ.', false);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang gửi...';

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    showFormStatus('Cảm ơn bạn! Chúng tôi sẽ liên hệ trong thời gian sớm nhất.', true);
                    contactForm.reset();
                } else {
                    showFormStatus('Có lỗi xảy ra. Vui lòng thử lại hoặc liên hệ trực tiếp qua email.', false);
                }
            } catch {
                showFormStatus('Không thể gửi. Vui lòng kiểm tra kết nối mạng và thử lại.', false);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Gửi yêu cầu tư vấn';
            }
        });
    }

    function showFormStatus(message, success) {
        if (!formStatus) return;
        formStatus.textContent = message;
        formStatus.className = 'text-center text-sm py-2 rounded-xl ' +
            (success ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50');
        formStatus.classList.remove('hidden');
        setTimeout(() => formStatus.classList.add('hidden'), 6000);
    }

    // ---- Counter Animation ----
    const counterElements = document.querySelectorAll('[data-counter]');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counterElements.forEach(el => counterObserver.observe(el));

    function animateCounter(el) {
        const target = parseInt(el.dataset.counter, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 1500;
        const startTime = performance.now();

        if (prefersReducedMotion) {
            el.textContent = target + suffix;
            return;
        }

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);

            el.textContent = current + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target + '+' + suffix;
            }
        }

        requestAnimationFrame(update);
    }

    // ============================================
    // KDIGI CMS INTEGRATION ENGINE
    // ============================================
    const modal = document.getElementById('cms-detail-modal');
    const modalClose = document.getElementById('cms-modal-close');
    const modalTitle = document.getElementById('cms-modal-title');
    const modalCategory = document.getElementById('cms-modal-category');
    const modalDate = document.getElementById('cms-modal-date');
    const modalContent = document.getElementById('cms-modal-content');

    function openModal({ title, category, date, content }) {
        if (!modal) return;
        modalTitle.textContent = title || '';
        modalCategory.textContent = category || 'Trig';
        modalDate.textContent = date || '';
        modalContent.innerHTML = content || '<p>Đang cập nhật nội dung...</p>';
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        lucide.createIcons();
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Helper: Strip HTML for excerpt
    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // Format date in Vietnamese
    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    // 1. Fetch Posts from KDIGI CMS
    async function loadCmsPosts() {
        const container = document.getElementById('cms-posts-container');
        if (!container) return;

        try {
            const endpoint = `${CMS_CONFIG.baseUrl}/api/posts?where[tenant][equals]=${CMS_CONFIG.tenantId}&sort=-publishedAt&limit=3`;
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!data.docs || data.docs.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-8 text-slate-400">
                        Chưa có bài viết nào được đăng tải.
                    </div>
                `;
                return;
            }

            container.innerHTML = data.docs.map((post, idx) => {
                const categoryName = (post.categories && post.categories[0] && post.categories[0].name) 
                    ? post.categories[0].name 
                    : 'Góc nhìn Trig';
                const dateText = formatDate(post.publishedAt || post.createdAt);
                const rawExcerpt = stripHtml(post.excerpt || post.content || '');
                const excerpt = rawExcerpt.length > 130 ? rawExcerpt.slice(0, 130) + '...' : rawExcerpt;

                return `
                    <article class="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between hover:shadow-xl hover:border-primary-300 transition-all duration-300 group cursor-pointer" data-post-idx="${idx}">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-4">
                                <span class="text-xs font-semibold px-3 py-1 rounded-full bg-primary-50 text-primary-600 group-hover:bg-primary-500 group-hover:text-white transition-colors duration-200">
                                    ${categoryName}
                                </span>
                                <span class="text-xs text-slate-400 flex items-center gap-1">
                                    <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                                    ${dateText}
                                </span>
                            </div>
                            <h3 class="font-heading font-bold text-lg text-slate-900 group-hover:text-primary-600 transition-colors duration-200 mb-3 leading-snug">
                                ${post.title}
                            </h3>
                            <p class="text-sm text-slate-500 leading-relaxed mb-6">
                                ${excerpt}
                            </p>
                        </div>
                        <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-semibold text-primary-500 group-hover:text-primary-600">
                            <span>Đọc chi tiết</span>
                            <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-1 transition-transform"></i>
                        </div>
                    </article>
                `;
            }).join('');

            // Bind click to open detail modal
            container.querySelectorAll('[data-post-idx]').forEach(card => {
                card.addEventListener('click', () => {
                    const idx = parseInt(card.getAttribute('data-post-idx'), 10);
                    const post = data.docs[idx];
                    if (post) {
                        const categoryName = (post.categories && post.categories[0] && post.categories[0].name) 
                            ? post.categories[0].name 
                            : 'Góc nhìn Trig';
                        openModal({
                            title: post.title,
                            category: categoryName,
                            date: formatDate(post.publishedAt || post.createdAt),
                            content: post.content || post.excerpt || '<p>Nội dung đang được cập nhật.</p>'
                        });
                    }
                });
            });

            lucide.createIcons();
        } catch (err) {
            console.warn('[KDIGI CMS] Could not fetch posts:', err);
            container.innerHTML = `
                <div class="col-span-full text-center py-6 text-slate-400 text-sm">
                    Không thể nạp bài viết từ CMS lúc này. Vui lòng thử lại sau.
                </div>
            `;
        }
    }

    // 2. Fetch Products / Services from KDIGI CMS
    async function loadCmsServices() {
        const servicesGrid = document.getElementById('services-grid');
        if (!servicesGrid) return;

        try {
            const endpoint = `${CMS_CONFIG.baseUrl}/api/products?where[tenant][equals]=${CMS_CONFIG.tenantId}&sort=id&limit=8`;
            const res = await fetch(endpoint);
            if (!res.ok) return; // Keep static fallback
            const data = await res.json();

            if (!data.docs || data.docs.length === 0) return; // Keep static fallback

            const icons = ['code-2', 'smartphone', 'layers', 'compass', 'cpu', 'shield-check', 'database', 'globe'];
            const colors = [
                { bg: 'bg-primary-50', hover: 'group-hover:bg-primary-100', text: 'text-primary-500' },
                { bg: 'bg-blue-50', hover: 'group-hover:bg-blue-100', text: 'text-blue-500' },
                { bg: 'bg-emerald-50', hover: 'group-hover:bg-emerald-100', text: 'text-emerald-500' },
                { bg: 'bg-violet-50', hover: 'group-hover:bg-violet-100', text: 'text-violet-500' },
                { bg: 'bg-amber-50', hover: 'group-hover:bg-amber-100', text: 'text-amber-500' },
                { bg: 'bg-rose-50', hover: 'group-hover:bg-rose-100', text: 'text-rose-500' }
            ];

            servicesGrid.innerHTML = data.docs.map((svc, idx) => {
                const icon = icons[idx % icons.length];
                const color = colors[idx % colors.length];
                const rawExcerpt = stripHtml(svc.excerpt || svc.description || '');

                return `
                    <div class="group bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-primary-200 transition-all duration-200 cursor-pointer fade-in visible" data-service-idx="${idx}">
                        <div class="w-12 h-12 rounded-xl ${color.bg} flex items-center justify-center mb-5 ${color.hover} transition-colors duration-200">
                            <i data-lucide="${icon}" class="w-6 h-6 ${color.text}"></i>
                        </div>
                        <h3 class="font-heading font-semibold text-lg text-slate-900 mb-2">${svc.title}</h3>
                        <p class="text-sm text-slate-500 leading-relaxed mb-4">
                            ${rawExcerpt}
                        </p>
                        <span class="inline-flex items-center text-sm font-medium text-primary-500 group-hover:gap-2 gap-1 transition-all duration-200">
                            Tìm hiểu thêm <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </span>
                    </div>
                `;
            }).join('');

            // Bind click to open modal
            servicesGrid.querySelectorAll('[data-service-idx]').forEach(card => {
                card.addEventListener('click', () => {
                    const idx = parseInt(card.getAttribute('data-service-idx'), 10);
                    const svc = data.docs[idx];
                    if (svc) {
                        openModal({
                            title: svc.title,
                            category: 'Dịch vụ Trig',
                            date: '',
                            content: svc.excerpt || svc.description || '<p>Chi tiết dịch vụ đang được cập nhật.</p>'
                        });
                    }
                });
            });

            lucide.createIcons();
        } catch (err) {
            console.warn('[KDIGI CMS] Services fallback kept:', err);
        }
    }

    // Initialize CMS dynamic fetching
    loadCmsPosts();
    loadCmsServices();
});
