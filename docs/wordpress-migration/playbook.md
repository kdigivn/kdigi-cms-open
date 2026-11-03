# Playbook: quyết định khi di chuyển WordPress → KDIGI CMS / Migration decision guide

> **English summary.** A decision guide for the common WordPress setups you will meet: **Yoast vs RankMath**
> (both are mapped into one SEO schema; REST-only sites get Yoast from `yoast_head_json` and RankMath from
> `getHead`), **Gutenberg / Classic / Elementor** content (the importer converts `post_content` HTML to Markdown, so
> page-builder layouts degrade to plain structure), **WooCommerce** (optional, products become generic Products with one
> price), **multilingual** (Polylang/WPML: one language per import run), **large media libraries**, **redirects and
> permalinks**, **cutover strategy**, plus a table of known pitfalls and fixes. Use it together with the
> [runbook](./runbook.md) (commands) and the [README](./README.md) (overview and flags).

## Cây quyết định nhanh

```
Site WordPress của bạn…
├─ Có WPGraphQL?            → có: archive bằng GraphQL (auto)        không: REST (auto) — kết quả như nhau
├─ SEO plugin?              → Yoast / RankMath / không có            (tự phát hiện; xem "Yoast vs RankMath")
├─ Soạn bằng gì?            → Gutenberg / Classic / Elementor …      (xem "Page builder")
├─ Có bán hàng WooCommerce? → có: sản phẩm → Products (tùy chọn)     (xem "WooCommerce")
├─ Nhiều ngôn ngữ?          → Polylang / WPML: mỗi lần chạy 1 ngôn ngữ (xem "Đa ngôn ngữ")
├─ Thư viện media > vài GB? → mirror một lần, chạy lại để tải tiếp   (xem "Media lớn")
├─ Domain đổi hay giữ?      → đổi: --domain mới + 301; giữ: cutover tại chỗ (xem "Cutover")
└─ Có plugin/post type lạ?  → custom post type: --cpt; dữ liệu trong meta/ACF: không import (xem "Dữ liệu ngoài post_content")
```

## Yoast vs RankMath

Cả hai được chuẩn hóa về một dạng `RawSeo` rồi vào `seo.*` của doc: `title`, `description`, `canonicalOverride`,
`robots`, `focusKeywords`, `openGraph.*` (+ ảnh OG), `twitterMeta`, `breadcrumbTitle`, và ngày xuất bản/sửa.
JSON-LD **không** import — CMS sinh lại từ dữ liệu doc + knowledge graph của Site.

| | Yoast SEO | RankMath |
| --- | --- | --- |
| Qua REST (không có WPGraphQL) | Có sẵn `yoast_head_json` trên mọi post/page/term — đủ title, description, canonical, robots, OG | Dựng từ trường `rank_math_*` nếu có; nếu không, gọi `GET /wp-json/rankmath/v1/getHead?url=<permalink>` cho từng URL (có throttle, cache ở `raw/rest/rankmath-head.json`) |
| Qua WPGraphQL | Cần plugin *WPGraphQL Yoast SEO* | Cần plugin *WPGraphQL for Rank Math* |
| Focus keyword | Yoast không công khai qua REST ⇒ để trống | Có (`focusKeywords`) |
| Quyết định | Không cần làm gì | Site lớn: `getHead` chậm (1 request/URL). Chấp nhận, hoặc chạy `wp-archive-rest-content.ts --no-network` để chỉ lấy trường REST (mất title/description tùy biến nếu plugin không expose) |

Quy tắc chung:

- **Canonical** được viết lại từ host WP/public sang `--domain`. Lint **lỗi** nếu canonical hoặc `og:url` còn trỏ host WP
  (trừ khi bạn cutover tại chỗ — cùng host).
- **Canonical tùy biến**: RankMath/Yoast cho phép đặt canonical khác URL của chính trang; nhiều site WP **không phát ra**
  giá trị đó ở frontend. Nếu importer mang nguyên sang `seo.canonicalOverride`, CMS sẽ áp dụng và có thể de-index nhầm
  trang đích. Trước khi lock, so canonical live (`curl` trang thật) với `staged/*/seo.canonicalOverride`, xóa các giá trị
  chỉ tồn tại trong database.
- **Robots**: chỉ các giá trị CMS cho phép (`index/follow/noindex/nofollow`, `max-snippet:-1`, `max-image-preview:large`,
  `max-video-preview:-1`); mặc định `index, follow`. Trang `noindex` ở WP vẫn `noindex` sau import.
- **Ảnh OG**: lấy từ `og:image` trong head; chỉ gắn riêng khi khác ảnh đại diện. Phase `media` tải ảnh, phase `seo` gắn
  `seo.openGraph.image`.
- **Không có SEO plugin**: `seo` rỗng ⇒ CMS tự sinh title/description theo template SEO của Site.
- **Redirect của plugin**: RankMath *Redirections* / Yoast Premium *Redirect manager* **không** được archive. Xuất CSV từ
  plugin rồi chuyển thành file `staged/redirects/*.json` (xem [runbook 3.4](./runbook.md#34-tùy-chọn-redirect-thủ-công)).

## Page builder

Importer chỉ đọc **HTML đã render của `post_content`** (qua REST `content.rendered` hoặc GraphQL `content`) và chuyển sang
GitHub-flavoured Markdown (`contentMd`). Hệ quả:

| Cách soạn | Kết quả | Việc cần làm |
| --- | --- | --- |
| **Classic Editor** | Tốt nhất: đoạn, heading, list, bảng, ảnh, link | Chỉ kiểm shortcode còn sót |
| **Gutenberg** | Tốt: chú thích `<!-- wp:… -->` bị bỏ; `wp-block-image`, bảng, list, quote, gallery, embed chuyển được | Block động (query loop, form, reusable block render ở frontend) không có trong `post_content` ⇒ mất |
| **Elementor / Divi / WPBakery / Beaver** | Cấu trúc bị làm phẳng: heading/đoạn/ảnh/nút giữ lại, layout cột/section/animation **mất**; có thể sót widget rỗng | Xem lại từng trang quan trọng ở `staged/pages/`; dựng lại landing đẹp bằng collection `landings` / blocks của CMS thay vì cố giữ layout |
| **Shortcode** (`[gallery]`, `[contact-form-7]`…) | `[gallery]` → bảng ảnh; shortcode lạ bị loại, nội dung bao quanh được giữ | Form/slider/popup phải dựng lại thủ công |

Mẹo:

- Trang Elementor/Divi hay bị rỗng hoặc chỉ còn vài dòng: `--gate lint` cảnh báo `contentMd empty`. Nguyên nhân thường là
  nội dung nằm trong meta của page builder (ví dụ `_elementor_data`) và `post_content` gần như trống — importer không đọc meta này.
- Dữ liệu trong ACF/meta box (custom fields) **không** được import. Nếu quan trọng, chuyển thành nội dung trong `contentMd`
  bằng cách thêm vào `staged/` tay, hoặc viết script riêng đọc `raw/rest/*.json` (REST chỉ có meta nếu đã đăng ký
  `show_in_rest`).
- Bảng có `rowspan`/ảnh trong ô, gallery, bold/italic lồng nhau đã được xử lý; HTML mơ hồ được giữ nguyên dạng inline HTML
  thay vì phá vỡ Markdown.

## WooCommerce

Tùy chọn. Nếu có, archive lấy `product`, `product_cat`, `product_tag` (và Store API công khai `wc/store/v1/products`):

| WooCommerce | KDIGI Products |
| --- | --- |
| Tên, slug, mô tả, mô tả ngắn | `title`, `slug`, `contentMd`, `excerpt` |
| Giá thường / giá khuyến mãi / tiền tệ | `prices[0]`: `originalPrice` / `currentPrice` / `currency` (một mức giá duy nhất) |
| Ảnh chính + gallery | `featuredImage` + `hero.slider` |
| Danh mục, tag | `categories` (taxonomy `product-category`, `tag`) |
| Biến thể, thuộc tính, tồn kho, giỏ hàng/thanh toán, đơn hàng, coupon, khách hàng | **Không** di chuyển |

Quyết định:

- **Chỉ cần trang giới thiệu sản phẩm/dịch vụ** (catalog, không bán online) → dùng Products của KDIGI như trang sản phẩm.
- **Cần giỏ hàng/thanh toán** → KDIGI không thay thế WooCommerce. Giữ WooCommerce làm backend bán hàng hoặc tích hợp
  cổng thanh toán ở frontend; chỉ dùng pipeline để chuyển nội dung/SEO.
- **Tiền tệ**: CMS hỗ trợ `VND, USD, EUR, GBP, JPY`. Tiền tệ khác ⇒ lint cảnh báo, importer để mặc định `VND` — sửa giá
  tay trong `staged/products/` hoặc trong admin.
- **Biến thể** (variable product): chỉ lấy một giá đại diện (giá hiện hành của sản phẩm cha).
- Không có WooCommerce nhưng có custom post type cho dịch vụ/dự án: `--cpt service=products`.

## Đa ngôn ngữ (Polylang / WPML)

- Pipeline nhập **một ngôn ngữ cho mỗi Site**. `--lang vi|en` quyết định ngôn ngữ giữ lại và `Sites.defaultLanguage`.
- Node có trường `lang` khác `--lang` bị bỏ và ghi vào `staged/_skipped-translations.json` (kèm danh sách `translations`).
- Nếu **không** node nào khớp ngôn ngữ (ví dụ site tiếng Anh nhưng quên `--lang en`), normalize **dừng** và yêu cầu truyền `--lang`
  thay vì lặng lẽ bỏ hết nội dung.
- Muốn nhiều ngôn ngữ: chạy pipeline nhiều lần với `--site` khác nhau (ví dụ `shop-vi`, `shop-en`) và `--lang` tương ứng,
  mỗi site một domain/subpath ở frontend; hoặc nhập một ngôn ngữ rồi dịch bằng tính năng localization của Payload (trường
  `vi`/`en`).
- Nội dung tiếng Anh vẫn được ghi vào locale mặc định của Payload (frontend đọc REST không truyền `?locale=`); `defaultLanguage`
  quyết định `inLanguage` của JSON-LD và ngôn ngữ của SEO template. Đổi ngôn ngữ Site xong chạy lại `content`/`seo` và
  `regen-jsonld.ts`.
- Slug trùng giữa các ngôn ngữ (WPML) sẽ va nhau nếu nhập chung một Site — luôn tách Site.

## Media lớn

- `wp-archive-rest.ts` tải song song (`--concurrency=N`, mặc định 8), **bỏ qua file đã có**, ghi file lỗi vào
  `raw/media/failed.json`. Bị ngắt giữa chừng thì chạy lại — không tải lại từ đầu.
- Server WordPress/WAF chặn tải hàng loạt? Giảm `--concurrency=2`, đặt `WP_USER_AGENT` khác.
- Thư viện hàng chục GB: chạy archive trên máy có đĩa và băng thông đủ; `wp-archive/` có thể là symlink sang ổ ngoài.
  Hoặc tải trước `wp-content/uploads` bằng `rsync`/`wget -m` vào `raw/media/files/wp-content/uploads/` — importer ưu tiên
  file local khi khớp đường dẫn nguồn.
- Phase `media` tạo **một media doc cho mỗi ảnh trong inventory của WordPress** (chỉ file gốc, không phải từng kích thước
  thumbnail). Với 10 000+ ảnh, chạy `--from media --to media` riêng và theo dõi log `…N media created`; chạy lại an toàn
  (idempotent theo `sourceMediaId`).
- Dùng **R2 / S3-compatible** cho thư viện lớn ([media-storage.md](../media-storage.md)); local-disk phù hợp thử nghiệm và
  site nhỏ. Cấu hình storage **trước** khi import để file đi thẳng vào nơi cuối cùng.
- Đặt `PAYLOAD_PUBLIC_SERVER_URL` về URL thật *trước* phase `media`: với `--media-urls cms` URL ảnh trong thân bài được ghi
  từ `media.url`, nên chạy với `http://localhost:3000` sẽ ghi URL localhost vào nội dung. Lỡ ghi sai: sửa env rồi chạy lại
  `--from content --to media` — phase `content` ghi lại `contentMd` gốc từ `staged/` (URL nguồn) và phase `media` thay lại
  bằng URL đúng.
- Ảnh nhạy cảm/không được phép chuyển: [denylist](./runbook.md#35-tùy-chọn-denylist-media).
- Media 404 ở nguồn: `failed.json` liệt kê; quyết định bỏ (denylist) hoặc thay file — đừng dùng ảnh giả che lỗi.

## Redirect và permalink

- Phase `redirects` sinh 301 `sourcePath` (permalink WP, ví dụ `/2024/05/ten-bai/`) → đường dẫn mới
  (`/ten-bai` cho post/page, `/product/<slug>` cho product — quy tắc ở `src/lib/frontend-public-path.ts`).
- Trang **lồng nhau** (`/ve-chung-toi/doi-ngu/`) được làm phẳng thành slug cuối (`/doi-ngu`) và có redirect. Hai trang con
  cùng slug ở hai cha khác nhau ⇒ **trùng slug**: đổi một slug trong `staged/pages/` trước khi lock.
- Redirect **không** tự sinh cho: trang lưu trữ taxonomy (`/category/<slug>/`, `/tag/<slug>/`), trang tác giả, phân trang,
  feed, `?p=123`, đính kèm (`/attachment/…`). Liệt kê các URL có traffic/backlink (Search Console, log truy cập,
  sitemap cũ) và thêm vào `staged/redirects/`.
- Không tạo chuỗi redirect (A→B→C); `to` luôn là đích cuối.
- Nội dung bị xóa: để `draft` (404) thay vì redirect về trang chủ (soft-404 gây hại SEO).
- Redirect chỉ cần `from` duy nhất trong Site; chạy lại phase chỉ cập nhật dòng thay đổi.
- Đổi slug sau này **trong admin** do hook tạo redirect; script import/API gọi Local API không có `req.user` có thể không
  tạo redirect — tự tạo theo pattern của `phase-redirects.ts`.

## Dữ liệu ngoài post_content

| Dữ liệu | Có import? | Cách xử lý |
| --- | --- | --- |
| Menu | Có | Cần REST menus (WP ≥ 5.9 + Application Password) hoặc WPGraphQL; không có ⇒ `menus.json` rỗng, dựng menu tay trong admin |
| Widget, sidebar, footer theme | Không | Cấu hình Site (`footer`, `contact`) trong admin |
| Form (CF7, WPForms…) | Không | Dựng lại bằng giải pháp form của frontend |
| User WordPress | Chỉ làm *authors* | Không tạo tài khoản đăng nhập; mời editor qua admin |
| Bình luận | Có (post/product) | Không cho page; `trash` bị bỏ; `hold` → `pending` |
| Custom fields (ACF/meta) | Không | Xem mục page builder |
| Custom post type | Có, qua `--cpt` | Chỉ phần `post_content` + term + featured image |
| Nhiều taxonomy tùy biến | Có | Type `custom`, `customType` = tên taxonomy; ngoại lệ cần UI riêng ở frontend |
| Sitemap, robots.txt | Không | Frontend sinh |

## Chiến lược cutover

1. **Đổi domain** (WP ở `old.example.com` → KDIGI ở `example.com`): `--wp-url https://old.example.com --domain example.com`.
   Canonical và `og:url` được viết lại sang domain mới; link nội bộ trong bài trở thành đường dẫn tương đối.
2. **Backend WordPress tách khỏi site công khai** (WP backend `wp.example.com`, site công khai cũ `example.com`, KDIGI sẽ phục
   vụ `example.com`): `--wp-url https://wp.example.com --public-url https://example.com --domain example.com`. Link nội bộ
   trỏ `example.com` thành đường dẫn tương đối; canonical/`og:url` viết lại sang `--domain`.
3. **Thay thế tại chỗ** (cùng host): `--wp-url` và `--domain` cùng host. Bắt buộc có redirect cho mọi URL thay đổi và
   kiểm `robots`/canonical trên bản staging trước khi chuyển DNS.

Quy trình khuyến nghị: baseline nguồn (sitemap + canonical + status code của toàn bộ URL) → import vào DB local/staging →
duyệt checklist [runbook §6](./runbook.md#6-checklist-nghiệm-thu) → import production (backup bắt buộc) → so sánh lại URL →
chuyển DNS → theo dõi Search Console 2–4 tuần → tắt WordPress.

**Đóng băng nội dung** WordPress từ lúc archive cuối cùng đến cutover, hoặc archive lại + `--regen-staged` trên bản sao
(chỉ khi bạn chấp nhận mất chỉnh sửa tay — **lưu bản cũ của `staged/`** và so diff trước khi ghi đè).

## Pitfall đã biết và cách xử lý

| Triệu chứng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `--archive-via graphql` báo không có endpoint | Site không cài WPGraphQL, hoặc plugin bảo mật chặn `/graphql` | Dùng `--archive-via rest` (mặc định `auto` tự fallback) |
| REST trả 401/403 / "rest_cannot_access" | Plugin bảo mật/WAF, hoặc chặn REST cho khách | Tạo Application Password và đặt `WP_AUTH_USER/PASSWORD`; hoặc whitelist IP; đặt `WP_USER_AGENT` |
| Thiếu bài `draft`/`private`/`future` | REST công khai chỉ trả `publish` | Dùng Application Password (archive thêm `status=any`) |
| Wordfence chặn IP khi quét user | Liệt kê `users` bị coi là user enumeration | Pipeline không query `users` qua GraphQL; REST `/users` chỉ khi được phép, thất bại được bỏ qua — tác giả lấy từ bài viết |
| Ngày xuất bản lệch vài giờ | WP trả giờ địa phương không kèm offset | Đặt `WP_UTC_OFFSET` đúng (ví dụ `+07:00`) rồi `--regen-staged` |
| Mọi bài hiện ngày import / sai thứ tự | `publishedAt` bị ép `now()` | Pipeline truyền cờ giữ ngày nguồn; nếu import bằng script riêng, hãy bật `__preserveSourcePublishedAt` |
| Chữ HTML entity (`&amp;`, `&#8211;`) trong title | Raw giữ nguyên văn | Normalize đã giải mã; nếu còn sót ở `staged/`, sửa tay |
| Excerpt cụt giữa câu, kết thúc `[…]` | WP chỉ có excerpt tự động cắt ~55 từ | Normalize thay bằng `seo.description`; không có thì để trống để hook sinh excerpt từ nội dung |
| Thân bài có `**`, link Markdown thô, chữ dính nhau | HTML inline mơ hồ | Bộ chuyển giữ inline HTML cho trường hợp mơ hồ; kiểm `staged/` và sửa tay trước lock |
| Ảnh trong bảng biến mất / dữ liệu bảng lệch cột | `<img>` trong ô, `rowspan` | Đã xử lý trong `wp-html-table-to-gfm.ts`; nếu gặp biến thể mới, thêm test + sửa converter |
| Ảnh trong bài vỡ sau cutover | `--media-urls source` mà WordPress đã tắt, hoặc URL localhost | Dùng `--media-urls cms` (mặc định) và `PAYLOAD_PUBLIC_SERVER_URL` đúng — xem "Media lớn" |
| Nhiều ảnh trùng `name-1.webp`, `name-2.webp` | Ref ảnh không có id WP bị tạo lại mỗi lần chạy | Idempotent theo `sourceMediaId`, rồi theo tên file trong Site; chạy lại không tạo thêm |
| Taxonomy `product_cat` lẫn với `category` | Gộp hai taxonomy cùng `category` làm mất URL danh mục sản phẩm | Pipeline giữ riêng `product-category`; phase `schema` throw nếu enum thiếu giá trị |
| Taxonomy trùng slug giữa `post_tag` và `product_tag` | Cả hai map về type `tag` | Cùng slug được gộp thành một term `tag` |
| `schema gate: … enum missing` | DB chưa migrate đủ | `pnpm migrate` rồi chạy lại |
| `GATE: staged/ changed after lock` | Sửa JSON sau khi khóa | `--gate lint` → `--gate lock` |
| `taxonomy gate: N staged term(s) missing` | Lỗi ghi một số term | Xem log, sửa dữ liệu, chạy lại `--from taxonomy --to taxonomy` |
| Redirect không tạo cho trang đổi slug | Hook auto-301 cần `req.user` | Dùng phase `redirects` hoặc `staged/redirects/` |
| `ValidationError` trên `seo.openGraph.image` | Ghi URL chuỗi vào trường upload | Đã chặn: phase `content` bỏ chuỗi, phase `seo` gắn media id — không bỏ qua hai phase này |
| `ValidationError` redirect thiếu site | Tạo redirect không có `tenant` | Importer luôn truyền `tenant`; script riêng phải làm tương tự |
| Re-run `content` ghi lại mọi thứ | So sánh không ổn định | Importer so hash đã chuẩn hóa (khóa sắp xếp, ISO datetime); nếu vẫn `updated` mỗi lần, mở issue kèm doc mẫu |
| Rating bài = 0 | Rating chỉ lấy khi site dùng *kk Star Ratings* và nguồn expose | Không có plugin ⇒ không có rating; import không hạ rating đang có trên CMS |
| `pg_dump failed to start` | Thiếu `postgresql-client` hoặc không có trong container | Cài, hoặc chạy migration từ máy host; không có cờ bỏ backup |
| Docker: DB `postgres` bị coi là remote | Hostname không thuộc danh sách local | Đặt `KDIGI_LOCAL_DB_HOSTS=postgres` (chỉ cho DB bạn kiểm soát) |
| Canonical trỏ trang khác sau import | Canonical tùy biến chỉ có trong DB của WP | Xem mục "Canonical tùy biến" |

Gặp lỗi mới? Hãy sửa **ở pipeline** (converter, normalize, phase) kèm test hồi quy thay vì vá dữ liệu bằng script
một lần, để lần di chuyển sau không lặp lại.
