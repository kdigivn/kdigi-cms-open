# Di chuyển WordPress → KDIGI CMS / Migrating WordPress → KDIGI CMS

> **English summary.** KDIGI CMS ships a generic, idempotent, 8-phase pipeline that moves **any** WordPress
> site (posts, pages, categories/tags/custom taxonomies, media, menus, authors, comments, Yoast **and** RankMath SEO,
> redirects, optional WooCommerce products) into one KDIGI *site*. Data flows
> `WordPress → raw/ (immutable mirror) → staged/ (editable JSON) → review gate → Payload`.
> Nothing is written to the database before an editor locks the staged data (`--gate lock`), and any
> non-local database is `pg_dump`-ed first (no skip flag). Start with the [runbook](./runbook.md)
> (step-by-step commands) and use the [playbook](./playbook.md) to decide how to handle your WordPress setup
> (Yoast vs RankMath, Gutenberg/Elementor/Classic, WooCommerce, Polylang/WPML, big media libraries, known pitfalls).

Tài liệu này mô tả pipeline di chuyển nội dung từ **bất kỳ site WordPress nào** sang KDIGI CMS. Pipeline nằm ở
`src/importers/run-wp-migration.ts` (điều phối), `src/importers/wp-migration/**` (chuẩn hóa + các phase) và
`src/scripts/wp-archive-*` (tải dữ liệu nguồn).

## Tài liệu trong thư mục này

| Tài liệu | Dùng khi |
| --- | --- |
| [runbook.md](./runbook.md) | Bạn cần **lệnh chạy từng bước từ con số 0**: chuẩn bị, archive, review, import, kiểm tra, rollback |
| [playbook.md](./playbook.md) | Bạn cần **quyết định**: site của bạn dùng Yoast hay RankMath, Elementor hay Gutenberg, có WooCommerce / đa ngôn ngữ / thư viện media lớn không, và các lỗi đã biết |

## Phạm vi di chuyển

| Nguồn WordPress | Đích KDIGI | Ghi chú |
| --- | --- | --- |
| `post` | `posts` | Nội dung → Markdown (`contentMd`), ngày xuất bản giữ nguyên |
| `page` | `pages` | Page lồng nhau được làm phẳng theo slug; có redirect từ URL cũ |
| `category`, `post_tag` | `taxonomies` (`category`, `tag`) | Giữ cây cha/con |
| Taxonomy tùy biến (`genre`, `brand`…) | `taxonomies` (`custom` + `customType`) | `customType` = tên taxonomy gốc |
| WooCommerce `product`, `product_cat`, `product_tag` | `products`, `taxonomies` (`product-category`, `tag`) | Tùy chọn; một giá chung (`prices[0]`), gallery → `hero.slider` |
| Custom post type khác | `posts` / `pages` / `products` | Khai báo bằng `--cpt <type>=<collection>` |
| Media Library | `media` | Binary tải về từ REST; local-disk hoặc R2 tùy cấu hình storage |
| Menu | `menus` | Cây nhiều cấp; map vị trí WP → `PRIMARY` / `FOOTER_MENU` / … |
| Tác giả | `authors` | Lấy từ bài viết (+ `/users` nếu REST cho phép) |
| Bình luận | `comments` | Bình luận của post/product; bình luận spam giữ trạng thái `spam` |
| Yoast SEO / RankMath | `seo.*` của từng doc | Title, description, canonical, robots, Open Graph, twitter, focus keyword |
| Logo, favicon, JSON-LD Organization, link mạng xã hội | `sites.branding`, `sites.knowledgeGraph`, `sites.socialProfiles` | Chỉ điền phần WordPress thực sự sở hữu |
| Permalink cũ | `redirects` (301) | Tự sinh khi đường dẫn đổi; thêm tay qua `staged/redirects/` |

**Không** di chuyển: theme/giao diện, plugin, cấu hình form, người dùng đăng nhập WP, nội dung do page builder
lưu ngoài `post_content` (xem [playbook](./playbook.md#page-builder)).

## Luồng dữ liệu

```
 ┌────────────┐   archive    ┌───────────────────────┐  normalize  ┌──────────────────────┐
 │ WordPress  │ ───────────▶ │ wp-archive/<site>/raw │ ──────────▶ │ wp-archive/<site>/   │
 │ REST /     │  (bước 1)    │  rest/  content/      │  (bước 2)   │  staged/<collection>/│
 │ WPGraphQL  │              │  media/files/         │             │  *.json (1 file/doc) │
 └────────────┘              └───────────────────────┘             └──────────┬───────────┘
                                                                              │ review + sửa tay (bước 3)
                                                                              ▼
                                      --gate lint  ──▶  --gate lock  ──▶  .gate-lock (hash nội dung)
                                                                              │
                              ┌── backup gate: DB không phải local ⇒ pg_dump bắt buộc ──┐
                              ▼                                                          │
   schema ▶ seed ▶ taxonomy ▶ content ▶ media ▶ seo ▶ nav ▶ comments ▶ redirects  ◀───────┘
   (bước 4: import, idempotent, chạy lại được, có --dry-run)
```

1. **Archive** — tải bản chụp nguồn. Ưu tiên WPGraphQL nếu site có; nếu không, dựng từ REST API chuẩn của WordPress
   (chạy được trên mọi site). `raw/` là bản sao nguồn, không sửa tay.
2. **Normalize** — chuyển `raw/` thành `staged/`: HTML → Markdown, SEO của Yoast/RankMath → một schema thống nhất,
   taxonomy/menu/author/media/comment, đường dẫn nguồn cho redirect.
3. **Review gate** — con người rà soát và sửa `staged/`, `--gate lint` phải sạch, `--gate lock` ghi hash nội dung.
   Sửa `staged/` sau khi lock sẽ làm lock mất hiệu lực.
4. **Import** — 8 phase ghi vào Payload, mỗi phase kiểm lại lock; ghi vào DB không phải local luôn `pg_dump` trước.

## 8 phase import

| # | Phase | Việc làm |
| --- | --- | --- |
| 0 | `schema` | `pnpm payload migrate` rồi kiểm các giá trị enum mà importer cần (không chạy khi `--dry-run`; vẫn đọc DB) |
| 1 | `seed` | Tạo `Site` nếu chưa có (không bao giờ ghi đè Site có sẵn) + tạo tác giả |
| 2 | `taxonomy` | Upsert category / tag / product-category / custom, nối cây cha–con |
| 3 | `content` | Upsert pages / posts / products (+ FAQ, rating, giá); giữ `publishedAt` của WP |
| 4 | `media` | Tải/tạo media, gắn featured image, gallery, ảnh OG, **ghi lại URL ảnh trong thân bài** |
| 5 | `seo` | Áp lại nhóm `seo` (canonical, robots, OG, twitter, article dates) |
| 6 | `nav` | Menu, cấu hình site (logo, favicon, knowledge graph, social), FAQ |
| 7 | `comments` | Bình luận của post/product |
| 8 | `redirects` | 301 từ permalink WP cũ → đường dẫn mới + các dòng thủ công |

`schema` là bước chuẩn bị DB; **8 phase ghi dữ liệu** là `seed` → `redirects`. Danh sách phase nằm ở `IMPORT_PHASES`
trong `src/importers/wp-migration/wp-migration-config.ts`.

## Cấu hình: cờ CLI và biến môi trường

Không có tên site, host hay đường dẫn cứng trong mã: mọi thứ qua cờ CLI hoặc env.

| Cờ | Ý nghĩa |
| --- | --- |
| `--site <siteKey>` | `Sites.siteKey` (a–z, 0–9, `-`) và tên thư mục `wp-archive/<siteKey>/` — **bắt buộc** |
| `--wp-url <https://wp.example.com>` | Origin của backend WordPress (REST/GraphQL) — bắt buộc trừ `--gate status` |
| `--domain <example.com>` | Domain công khai **mới** (ghi vào `Sites.domain`, viết lại canonical/OG) |
| `--public-url <https://www.example.com>` | Host công khai của site WP cũ nếu khác `--wp-url` (để đổi link nội bộ thành đường dẫn tương đối) |
| `--lang vi\|en` | Ngôn ngữ site (mặc định `vi`); site đa ngôn ngữ chỉ giữ ngôn ngữ này |
| `--archive`, `--archive-via auto\|graphql\|rest` | Tải lại archive / chọn nguồn |
| `--regen-staged` | Dựng lại `staged/` từ `raw/` (**ghi đè chỉnh sửa tay**, có hỏi xác nhận) |
| `--cpt <type>=<posts\|pages\|products>[,…]` | Nhập custom post type |
| `--only media,…` | Chỉ normalize các collection nêu tên |
| `--gate lint\|lock\|status` | Cổng review |
| `--from <phase> --to <phase>` | Chạy khoảng phase import (không có ⇒ không import) |
| `--media-urls cms\|source` | Ảnh trong thân bài trỏ về URL của CMS (mặc định) hay giữ URL nguồn |
| `--dry-run`, `--yes` | Xem trước không ghi / bỏ câu hỏi xác nhận |

| Biến môi trường | Ý nghĩa |
| --- | --- |
| `DATABASE_URI` | Postgres đích (bắt buộc cho import) |
| `WP_AUTH_USER`, `WP_AUTH_PASSWORD` | WordPress *Application Password* — tùy chọn, mở khóa media riêng tư, menu, users |
| `WP_POST_TYPES` | Danh sách post type bổ sung cần archive, ví dụ `portfolio,event` |
| `WP_UTC_OFFSET` | Múi giờ của WordPress khi API trả ngày không kèm offset, ví dụ `+07:00` (mặc định `+00:00`) |
| `KDIGI_LOCAL_DB_HOSTS` | Hostname Postgres được coi là local (ví dụ `postgres` trong docker compose) |
| `BACKUP_DIR` | Thư mục lưu file `pg_dump` (mặc định `backups-local/`) |
| `GATE_APPROVER` | Tên người duyệt ghi vào `.gate-lock` (mặc định user hệ điều hành) |

## Backup gate (cổng sao lưu)

`src/importers/wp-migration/prod-backup-gate.ts`: nếu host của `DATABASE_URI` **không** thuộc
`localhost / 127.0.0.1 / ::1 / host.docker.internal / KDIGI_LOCAL_DB_HOSTS` — hoặc URI không phân tích được —
orchestrator hỏi xác nhận rồi chạy `pg_dump -Fc` vào `backups-local/`. Dump lỗi hoặc rỗng ⇒ **dừng**.
Không có cờ bỏ qua; `--yes` chỉ bỏ câu hỏi; `--dry-run` không ghi nên không dump. Cần `pg_dump` (gói
`postgresql-client`) khớp phiên bản server.

## Cấu trúc mã nguồn

| Đường dẫn | Vai trò |
| --- | --- |
| `src/importers/run-wp-migration.ts` | CLI điều phối |
| `src/importers/wp-migration/wp-migration-config.ts` | Cấu hình site, đường dẫn, danh sách phase, map taxonomy |
| `src/importers/wp-migration/raw-wp-types.ts` | Hợp đồng dữ liệu `raw/content/*.json` |
| `src/importers/wp-migration/staged-doc-types.ts` | Hợp đồng dữ liệu `staged/**` |
| `src/importers/wp-migration/normalize-raw-to-staged.ts`, `seo-to-staged.ts` | Bước 2 |
| `src/importers/wp-migration/staged-gate.ts`, `release-content-policy.ts` | Bước 3 (lint/lock, denylist media) |
| `src/importers/wp-migration/phase-*.ts` | Bước 4 |
| `src/importers/wp-html-to-gfm*.ts` | Bộ chuyển HTML → Markdown |
| `src/importers/regen-jsonld.ts`, `seed-default-authors.ts` | Công cụ bảo trì độc lập |
| `src/scripts/wp-archive-*.ts` | Bước 1 |
