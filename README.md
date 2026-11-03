# KDIGI CMS

**CMS headless mã nguồn mở, quản lý nhiều website trên một hệ thống duy nhất.**
Payload 3 · Next.js 15 · PostgreSQL · Soạn thảo Markdown · SEO tích hợp · Giấy phép MIT

🇬🇧 [English version](README.en.md) · 🌐 [Website: opencms.kdigi.vn](https://opencms.kdigi.vn) · 📚 [Tài liệu: docs.opencms.kdigi.vn](https://docs.opencms.kdigi.vn) · 🧪 [Demo trực tiếp](https://app.opencms.kdigi.vn/admin)

KDIGI CMS là trang quản trị và API (REST + GraphQL) để quản lý nội dung cho nhiều website cùng lúc. Website công khai của bạn (Next.js, Astro, Nuxt, mobile app…) lấy nội dung qua API; CMS lo phần soạn thảo, SEO, media, phân quyền và di chuyển dữ liệu từ WordPress. Phù hợp với agency, blogger, doanh nghiệp nhỏ và người đang muốn rời WordPress.

## Dùng thử trực tiếp

Mở <https://app.opencms.kdigi.vn/admin> và đăng nhập bằng tài khoản demo công khai:

| Email | Mật khẩu | Vai trò |
| --- | --- | --- |
| `demo@opencms.kdigi.vn` | `Demo@2026` | `editor`, chỉ thấy site `demo` |

Đây là môi trường thử nghiệm dùng chung: tài khoản demo không đổi được email/mật khẩu/API key của chính nó, và nội dung site `demo` được đặt lại mỗi đêm (03:00, giờ Việt Nam). Đừng nhập dữ liệu thật. Cách bật cơ chế này cho site của bạn: [cấu hình](docs/configuration.md#public-demo-accounts-optional).

> **Nguồn gốc:** KDIGI CMS được tách ra từ một hệ thống CMS đa website đã chạy thực tế trong môi trường production, rồi tổng quát hóa để mọi người dùng chung.

## Tính năng

- **Đa website (multi-site):** một bản cài phục vụ nhiều tên miền; mỗi site có thương hiệu, SEO mặc định, thông tin liên hệ, footer, menu, nội dung và (tùy chọn) kho lưu trữ riêng. Dữ liệu được cách ly theo site bằng kiểm soát truy cập tường minh.
- **Phân quyền:** `super-admin` › `admin` › `editor` › `author`, gán người dùng vào từng site.
- **Mô hình nội dung:** Trang, Bài viết, Sản phẩm/dịch vụ, Landing page (block), Chuyên mục/Thẻ, Tác giả, Menu dạng cây, FAQ, Shortcode, Redirect, Bình luận (có reCAPTCHA), Đánh giá sao. Lịch sử phiên bản, thùng rác, hẹn giờ đăng.
- **Song ngữ Việt/Anh:** nội dung `vi` (mặc định) và `en` có fallback; giao diện admin tiếng Việt và tiếng Anh.
- **Trình soạn thảo Markdown (Milkdown):** slash menu, chọn media/link nội bộ, shortcode, tìm & thay thế, dán nội dung giàu định dạng; API trả HTML đã làm sạch.
- **Media:** thư viện có thư mục, trình sửa ảnh, chuyển WebP khi upload (site dùng R2), nhập ảnh từ URL (chống SSRF). **Mặc định lưu trên ổ đĩa — không cần tài khoản cloud**; tùy chọn Cloudflare R2 riêng cho từng site.
- **SEO:** JSON-LD (`@graph`), mẫu tiêu đề/mô tả kiểu RankMath, chấm điểm & kiểm tra SEO, gợi ý liên kết nội bộ, redirect tự động khi đổi slug, tạo nội dung SEO bằng AI (tùy chọn).
- **Công cụ biên tập:** lịch nội dung / bảng điều khiển biên tập.
- **Tích hợp frontend:** REST/GraphQL, webhook revalidate (ISR) khi nội dung đổi, link "xem trên site".
- **Di chuyển từ WordPress:** pipeline nhập nhiều giai đoạn (thô → chuẩn hóa → nhập) có cổng duyệt và sao lưu. Xem [hướng dẫn](docs/wordpress-migration/README.md).
- **Triển khai dễ:** `docker compose up` là chạy; có sẵn cấu hình Coolify; site demo kèm nội dung mẫu.

## Bắt đầu nhanh

Yêu cầu: Docker (có Compose).

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
SEED_DEMO=true docker compose up --build
```

Mở <http://localhost:3000/admin>, tạo tài khoản đầu tiên (tự động là `super-admin`) rồi chọn site **demo** để xem nội dung mẫu. Bỏ `SEED_DEMO=true` nếu muốn bản cài trống. Dữ liệu nằm trong các volume Docker (`postgres_data`, `media_data`, `app_data`) và được giữ lại sau `docker compose down`.

### Chạy để phát triển (`pnpm dev`)

Yêu cầu: Node.js ≥ 20.9, pnpm 10, Docker (cho PostgreSQL).

```bash
pnpm install --frozen-lockfile
cp .env.example .env      # đặt PAYLOAD_SECRET ngẫu nhiên ≥ 32 ký tự
docker compose up -d db   # chỉ PostgreSQL, cổng 5432
pnpm migrate              # tạo schema (bắt buộc, không tự đồng bộ)
pnpm seed:demo            # tùy chọn: site demo + nội dung mẫu
pnpm dev                  # http://localhost:3000/admin
```

Chi tiết: [Bắt đầu](docs/getting-started.md).

## Cấu hình

Chỉ cần 3 biến: `DATABASE_URI`, `PAYLOAD_SECRET` (≥ 32 ký tự khi chạy production), `PAYLOAD_PUBLIC_SERVER_URL` (URL công khai của CMS). Với `docker compose up` bạn không cần đặt biến nào. Mọi biến tùy chọn (lưu trữ media, AI SEO, reCAPTCHA, job revalidate, OpenTelemetry…) có trong [`.env.example`](.env.example) và [docs/configuration.md](docs/configuration.md). Thông tin riêng của từng website (tên miền, thương hiệu, SEO, R2…) cấu hình ngay trong admin ở mục **Sites**.

## Mô hình đa site

Mỗi document trong collection **Sites** là một website, định danh bằng `siteKey` và `domain`. Mọi nội dung thuộc về đúng một site (trường `tenant`); frontend lấy nội dung của site mình bằng cách lọc theo site đó. Thêm site mới không cần triển khai lại CMS. Xem [docs/multi-site.md](docs/multi-site.md).

## Vai trò

| Vai trò | Quyền |
| --- | --- |
| `super-admin` | Toàn quyền mọi site; tạo site, người dùng và cấu hình lưu trữ |
| `admin` | Quản lý nội dung và cài đặt trong các site được gán |
| `editor` | Biên tập và đăng nội dung trong các site được gán |
| `author` | Viết và sửa bài của mình, không tự đăng |

Chi tiết: [docs/roles-and-permissions.md](docs/roles-and-permissions.md).

## Dùng API cho frontend

```bash
# 1) tìm id của site theo siteKey
curl 'https://cms.example.com/api/sites?where[siteKey][equals]=my-site&limit=1'
# 2) lấy bài viết đã xuất bản của site đó
curl 'https://cms.example.com/api/posts?where[tenant][equals]=1&sort=-publishedAt&limit=10&depth=1'
```

Request ẩn danh chỉ thấy nội dung đã xuất bản; trường nội dung Markdown được trả về dạng HTML ở đúng khóa gốc. GraphQL tại `/api/graphql`. Hợp đồng API đầy đủ (locale, SEO, menu, bình luận, revalidate): [docs/rest-api.md](docs/rest-api.md).

## Triển khai

Docker Compose trên bất kỳ VPS nào, hoặc [Coolify](https://coolify.io) với [`docker-compose.coolify.yml`](docker-compose.coolify.yml). Container tự chạy migration khi khởi động. Nhớ sao lưu cả database và thư mục media. Xem [docs/deploy.md](docs/deploy.md).

## Nâng cấp

Schema chỉ thay đổi bằng migration tường minh (`pnpm migrate`; trong Docker chạy tự động khi khởi động). Đọc [docs/upgrading.md](docs/upgrading.md) và [CHANGELOG](CHANGELOG.md) trước khi nâng cấp, và luôn sao lưu trước.

## Lệnh thường dùng

| Lệnh | Mục đích |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Phát triển / build / chạy production |
| `pnpm migrate` | Áp dụng migration PostgreSQL |
| `pnpm seed:demo` | Nạp site demo + nội dung mẫu (idempotent) |
| `pnpm demo:reset` | Xóa và nạp lại site `demo`, đặt lại mật khẩu các tài khoản trong `DEMO_ACCOUNT_EMAILS` |
| `pnpm typecheck` / `pnpm lint` | Kiểm tra TypeScript / ESLint (`next build` bỏ qua cả hai) |
| `pnpm test` / `pnpm test:integration` / `pnpm test:e2e` | Unit test / test với PostgreSQL thật / Playwright |
| `pnpm generate:types` / `pnpm generate:importmap` | Sinh type Payload / import map của admin |

## Công nghệ

Payload 3.90 · Next.js 15 (App Router) · React 19 · PostgreSQL · Milkdown · Tailwind CSS 4 + shadcn/ui (trong admin) · TypeScript · pnpm. Kiến trúc: [docs/architecture.md](docs/architecture.md).

## Đóng góp

Rất hoan nghênh! Đọc [CONTRIBUTING.md](CONTRIBUTING.md) và [Quy tắc ứng xử](CODE_OF_CONDUCT.md). Báo lỗi bảo mật theo [SECURITY.md](SECURITY.md) — **không** mở issue công khai.

## Giấy phép

[MIT](LICENSE) © 2026 [KDIGI](https://kdigi.vn). Website dự án: <https://opencms.kdigi.vn>.
