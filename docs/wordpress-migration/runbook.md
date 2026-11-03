# Runbook: di chuyển WordPress → KDIGI CMS / Migration runbook

> **English summary.** Step-by-step commands to migrate one WordPress site into one KDIGI *site*, from zero:
> (0) prerequisites and variables, (1) archive WordPress via WPGraphQL or the plain REST API into
> `wp-archive/<site>/raw/`, (2) normalize into editable `staged/` JSON, (3) review → `--gate lint` → `--gate lock`,
> (4) `--dry-run` then the real import `--from schema --to redirects` (a `pg_dump` backup is forced for any
> non-local database), (5) media, menus, SEO and redirects checks, (6) verification checklist, (7) rollback.
> Every command is idempotent and safe to re-run; nothing is written to the database before the gate is locked.
> For decisions (Yoast vs RankMath, page builders, WooCommerce, multilingual, huge media libraries, pitfalls) see
> the [playbook](./playbook.md); for the overview see the [README](./README.md).

Quy ước trong tài liệu: lệnh chạy ở thư mục gốc repo `kdigi-cms-open`. Ví dụ dùng `example.com` — thay bằng giá trị thật
của bạn. Mọi lệnh có thể chạy lại nhiều lần (idempotent).

## 0. Chuẩn bị

### 0.1 Yêu cầu

| Thứ cần có | Ghi chú |
| --- | --- |
| Node ≥ 20 + pnpm, repo đã `pnpm install` | Pipeline chạy bằng `node --import tsx` |
| PostgreSQL đích đã chạy và migrate | `pnpm migrate` (local: `docker compose up -d postgres`) |
| `DATABASE_URI` trong `.env` | Xem [backup gate](./README.md#backup-gate-cổng-sao-lưu) nếu DB không phải local |
| `pg_dump` (gói `postgresql-client`) | **Bắt buộc** khi ghi vào DB không phải local |
| Truy cập mạng tới site WordPress | REST API (`/wp-json/`) bật; WPGraphQL là tùy chọn |
| (Tùy chọn) WordPress *Application Password* | Mở khóa media riêng tư, nháp/private, menu, danh sách user. Tạo tại *Users → Profile → Application Passwords* |
| Dung lượng đĩa | ≈ kích thước thư viện media của WordPress (binary được mirror về `wp-archive/`) |

Thư mục `wp-archive/` đã nằm trong `.gitignore`; **không commit** dữ liệu WordPress.

### 0.2 Đặt biến

```bash
SITE=my-site                       # Sites.siteKey, a-z 0-9 và dấu -
WP_URL=https://wp.example.com      # backend WordPress (REST/GraphQL)
DOMAIN=example.com                 # domain công khai MỚI của site trên KDIGI
# PUBLIC_URL=https://www.example.com   # chỉ khi host công khai của WP cũ khác WP_URL
# LANG_CODE=vi                         # vi (mặc định) hoặc en
```

Định nghĩa lệnh rút gọn dùng xuyên suốt:

```bash
mig() { node --env-file=.env --import tsx src/importers/run-wp-migration.ts \
  --site "$SITE" --wp-url "$WP_URL" --domain "$DOMAIN" ${PUBLIC_URL:+--public-url "$PUBLIC_URL"} ${LANG_CODE:+--lang "$LANG_CODE"} "$@"; }
```

Biến môi trường tùy chọn (đặt trong `.env` hoặc trước lệnh):

```bash
export WP_AUTH_USER=admin                          # + application password
export WP_AUTH_PASSWORD='abcd efgh ijkl mnop qrst uvwx'
export WP_POST_TYPES=portfolio,event               # custom post type cần archive thêm
export WP_UTC_OFFSET=+07:00                        # múi giờ của WordPress (xem bước 1.3)
```

### 0.3 Kiểm tra nhanh nguồn WordPress

```bash
curl -s "$WP_URL/wp-json/" | head -c 400                 # phải trả JSON (name, namespaces…)
curl -s -o /dev/null -w '%{http_code}\n' "$WP_URL/wp-json/wp/v2/posts?per_page=1"   # mong đợi 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{__typename}"}' "$WP_URL/graphql"        # 200 ⇒ có WPGraphQL; 404 ⇒ dùng REST
```

Nếu REST trả 401/403 cho mọi thứ, plugin bảo mật/WAF đang chặn — xem [playbook › Pitfall](./playbook.md#pitfall-đã-biết-và-cách-xử-lý).

## 1. Archive — tải bản chụp WordPress

```bash
mig                       # lần đầu: archive → normalize → DỪNG ở review gate (exit ≠ 0 là bình thường)
```

Lệnh trên tự thực hiện các bước nhỏ dưới đây khi chưa có `raw/`. Bạn cũng có thể chạy từng script (hữu ích để debug):

```bash
export WP_URL OUT="wp-archive/$SITE/raw"

# (a) Mirror REST + media binary — luôn chạy
node --import tsx src/scripts/wp-archive-rest.ts                   # thêm --authed-media nếu có WP_AUTH_*

# (b1) Snapshot nội dung từ WPGraphQL (nếu site có)
node --import tsx src/scripts/wp-archive-graphql.ts --probe && \
node --import tsx src/scripts/wp-archive-graphql.ts

# (b2) …hoặc dựng snapshot từ REST (chạy được trên mọi WordPress)
node --import tsx src/scripts/wp-archive-rest-content.ts
```

`--archive-via auto|graphql|rest` của orchestrator chọn (b1) hay (b2); `auto` thử `--probe` trước, exit code 3 nghĩa là
không có GraphQL ⇒ dùng REST. Kết quả:

```
wp-archive/$SITE/raw/
├── rest/            # bản sao nguyên văn REST: posts, pages, media, taxonomies, types, index, menus…
├── content/         # snapshot thống nhất (hợp đồng: raw-wp-types.ts): posts, pages, products, terms,
│                    #   menus, site, comments, <custom-post-type>.json
└── media/files/     # binary media, đường dẫn giữ như trên nguồn (wp-content/uploads/…)
```

### 1.1 Kiểm tra số lượng

```bash
node -e '
const fs=require("fs"),d="wp-archive/"+process.env.SITE+"/raw/content/";
for (const f of fs.readdirSync(d)) { const j=JSON.parse(fs.readFileSync(d+f,"utf8")); console.log(f, Array.isArray(j)?j.length:Object.keys(j)); }'
```

So với *Posts / Pages / Media* trong WP admin. Thiếu bài `draft/private` ⇒ cần Application Password
(`WP_AUTH_USER`/`WP_AUTH_PASSWORD`) để archive thêm `status=any`.

### 1.2 Tải lại / bổ sung

```bash
mig --archive --yes       # tải lại JSON (binary media đã có thì bỏ qua). KHÔNG đụng staged/
```

Script media ghi các file lỗi vào `raw/media/failed.json`; chạy lại là tải tiếp phần còn thiếu.

### 1.3 Múi giờ

WordPress REST trả `date` theo giờ địa phương của site **không kèm offset**. Script REST content in ra gợi ý
`WP_UTC_OFFSET` từ `gmt_offset` của site; đặt biến này (ví dụ `+07:00`) **trước khi normalize** để `publishedAt`
đúng. Không đặt ⇒ coi là UTC.

## 2. Normalize — tạo `staged/`

`mig` ở bước 1 đã normalize khi chưa có `staged/`. Dựng lại từ `raw/` (xóa mọi chỉnh sửa tay!):

```bash
mig --regen-staged                       # hỏi xác nhận; --yes để bỏ hỏi
mig --cpt portfolio=posts,event=pages    # nhập custom post type vào posts/pages/products
mig --only media                         # chỉ normalize collection nêu tên, không ghi đè phần khác
```

Kết quả `wp-archive/$SITE/staged/`:

| Đường dẫn | Nội dung |
| --- | --- |
| `pages/`, `posts/`, `products/` | 1 file JSON/doc: `title`, `slug`, `contentMd`, `status`, `date`, `seo`, `featuredImage`, term refs, `sourcePath` |
| `taxonomies/` | `<type>--<wp-taxonomy>--<slug>.json` (category, tag, product-category, custom) |
| `authors/`, `media/`, `comments/` | tác giả, inventory media (kèm `alt`), bình luận |
| `menus/` | `PRIMARY.json`, `FOOTER_MENU.json`… (menu thừa: `.unmapped-<tên>.json`, bị bỏ qua) |
| `site/site-config.json` | logo, favicon, knowledge graph, social, ngôn ngữ |
| `faqs/`, `redirects/` | tạo tay (xem bước 3.3, 3.4) |
| `media-alt-fallback-report.md` | media thiếu alt text (alt sinh từ tên file) |
| `_skipped-translations.json` | bản dịch bị bỏ vì khác `--lang` (site đa ngôn ngữ) |

Normalize **không** ghi DB và **không** gọi mạng.

## 3. Review gate — rà soát và khóa

### 3.1 Rà soát (con người)

Mở `staged/` và kiểm tối thiểu:

- [ ] `contentMd` của vài bài mẫu mỗi loại: heading, bảng, ảnh, gallery, shortcode còn sót (`[xyz]`), khối embed.
- [ ] `slug`, `status` (`published`/`draft`) — chỉ `publish` của WP được giữ `published`.
- [ ] `seo` (title/description/canonical/robots) — canonical **phải** trỏ về `$DOMAIN`, không phải host WP.
- [ ] `taxonomies/` — kiểu đúng, cây cha/con đủ; xóa term không cần bằng file `.delete-<tên>.json`
  (`{ "type": "category", "slug": "uncategorized", "reason": "..." }`, thêm `customType` cho `custom`).
- [ ] `media/` — alt hợp lý (xem `media-alt-fallback-report.md`); ảnh nhạy cảm → denylist (3.5).
- [ ] `menus/` — URL tương đối, đúng vị trí `PRIMARY` / `FOOTER_MENU` / `MOBILE_MENU`.
- [ ] `site/site-config.json` — tên, logo, địa chỉ doanh nghiệp (từ JSON-LD).

Sửa trực tiếp file JSON. Mọi lần sửa sau khi lock làm lock **mất hiệu lực** (hash nội dung đổi).

### 3.2 Lint và lock

```bash
mig --gate lint           # in lỗi ✖ (chặn lock) và cảnh báo ⚠ (không chặn)
mig --gate lock           # chạy lint, sạch lỗi thì ghi staged/.gate-lock {approver, timestamp, contentHash}
mig --gate status         # chỉ cần --site; cho biết lock còn hiệu lực không
```

Người duyệt lấy từ `GATE_APPROVER` hoặc username hệ điều hành (không phải vai trò Payload). Lint kiểm: JSON hợp lệ,
slug/status/date, canonical & `og:url` còn trỏ host WP, term/author/media tham chiếu thiếu, menu, bình luận, site-config,
tiền tệ giá, rating, denylist media.

### 3.3 (Tùy chọn) FAQ

`staged/faqs/<nhóm>.json`:

```json
{ "collection": "faqs", "group": "shipping",
  "items": [ { "question": "Giao hàng mất bao lâu?", "answer": "2–3 ngày làm việc." } ] }
```

Gắn vào bài bằng `"faqs": ["shipping"]` trong file post/page/product. Nhóm FAQ được tạo ở phase `nav` (sau
`content`) ⇒ lần import đầu cần chạy lại `--from content --to content` để gắn quan hệ.

### 3.4 (Tùy chọn) Redirect thủ công

Phase `redirects` tự sinh 301 cho mọi doc đã `published` mà permalink WP khác đường dẫn mới. Redirect khác
(plugin redirect, URL đã bị xóa, …) đặt trong `staged/redirects/*.json`:

```json
{ "collection": "redirects", "from": "/old-landing/", "to": "/new-landing", "statusCode": 301, "note": "from RankMath" }
```

`statusCode` chỉ 301/302. Dòng thủ công thắng dòng tự sinh cùng `from`.

### 3.5 (Tùy chọn) Denylist media

`wp-archive/$SITE/denylist.json` — media không được phép sang CMS (ảnh chứa dữ liệu cá nhân, file 404…):

```json
{ "media": [ { "wpId": 123, "reason": "ảnh hóa đơn khách hàng" },
             { "filenameStem": "order-receipt", "reason": "private" } ] }
```

Normalize bỏ các media này; lint báo lỗi nếu staged vẫn tham chiếu chúng.

## 4. Import

### 4.1 Xem trước (không ghi Payload)

```bash
mig --from schema --to redirects --dry-run
```

Dry-run được phép khi chưa lock gate; **vẫn kết nối DB** (kiểm enum ở phase `schema`). Đọc log từng phase:
số doc `create/update/skipped`, media sẽ tải, redirect sẽ tạo.

### 4.2 Backup gate

Nếu host `DATABASE_URI` không local (xem [README](./README.md#backup-gate-cổng-sao-lưu)):

```bash
pg_dump --version                                  # phải có và khớp phiên bản server
export KDIGI_LOCAL_DB_HOSTS=postgres               # chỉ khi đó là DB local qua tên service docker
```

Lần ghi thật sẽ hỏi xác nhận rồi tạo `backups-local/db-<thời-gian>-pre-wp-migration-<site>.dump`. Dump lỗi/rỗng ⇒ dừng.
**Ghi lại tên file dump — đó là điểm rollback.**

### 4.3 Import thật

```bash
mig --from schema --to redirects
```

Hoặc từng đoạn (mỗi phase kiểm lại lock/hash trước khi chạy):

```bash
mig --from schema   --to taxonomy
mig --from content  --to media
mig --from seo      --to redirects
```

| Phase | Kiểm tra ngay sau khi chạy |
| --- | --- |
| `schema` | Không throw `schema gate: … enum missing` |
| `seed` | Admin → Sites có `$SITE` với `domain=$DOMAIN` |
| `taxonomy` | `gate OK — counts match staged` |
| `content` | `errors: 0`; chạy lại lần 2 phải ra `skipped: N` (idempotent) |
| `media` | `inventory — created: N … failed: 0` |
| `seo`, `nav`, `comments`, `redirects` | `errors: 0` |

**Media — URL trong thân bài.** Mặc định (`--media-urls cms`) phase `media` thay URL ảnh WordPress trong `contentMd`
bằng URL của media đã tạo trong CMS, nên có thể tắt WordPress mà ảnh vẫn sống. Muốn giữ nguyên URL nguồn (WP/CDN
vẫn còn chạy lâu dài): `--media-urls source`. Storage mặc định: R2 nếu đã cấu hình, nếu không là ổ đĩa local
([media-storage.md](../media-storage.md)).

**Site mới.** Phase `seed` chỉ *tạo* Site khi chưa có và không bao giờ ghi đè Site có sẵn; theme, footer, contact,
SEO defaults… cấu hình ở admin sau import.

### 4.4 Chạy lại / sửa sai

- Sửa `staged/` → `--gate lint` → `--gate lock` → chạy lại phase cần thiết (`--from content --to seo`).
- Content phase chỉ ghi khi dữ liệu khác bản đang có (hash); rating đang có trên CMS không bị hạ xuống.
- Phase `taxonomy` không xóa term trừ khi có file `.delete-*.json`.

## 5. Media, menu, SEO, redirect — kiểm sâu

### 5.1 Media

```bash
# số media trong CMS so với staged
ls wp-archive/$SITE/staged/media | wc -l
```

Admin → Media: lọc theo Site; mở ngẫu nhiên 5 ảnh (render được, đúng alt). Mở 3 bài có ảnh trong thân và xem nguồn HTML:
ảnh phải trỏ `…/api/media/file/…` (hoặc CDN/R2 của bạn), không còn `wp-content/uploads` của host WP cũ (trừ `--media-urls source`).

### 5.2 Menu

Admin → Menus: các vị trí `PRIMARY`, `FOOTER_MENU`, … có cây đúng; mọi URL là đường dẫn tương đối tồn tại.
Menu WP không gắn vị trí được chuẩn hóa theo tên (`footer` → `FOOTER_MENU`, `mobile` → `MOBILE_MENU`, còn lại `PRIMARY`);
menu thừa nằm ở `staged/menus/.unmapped-*.json` — gộp tay vào menu chính rồi import lại phase `nav`.

### 5.3 SEO

Chọn 3 bài/page/product: mở tab SEO — title, description, canonical (về `$DOMAIN`), robots, OG image. JSON-LD do hook của
CMS sinh lại, không import từ WordPress. Sau khi đổi `defaultLanguage` hoặc dữ liệu knowledge graph, rebuild JSON-LD:

```bash
node --env-file=.env --import tsx src/importers/regen-jsonld.ts --site "$SITE" --dry-run
node --env-file=.env --import tsx src/importers/regen-jsonld.ts --site "$SITE"
```

Gán tác giả mặc định cho bài chưa có tác giả (tùy chọn):

```bash
node --env-file=.env --import tsx src/importers/seed-default-authors.ts --site "$SITE" \
  --author-name "Editorial Team" --author-slug editorial-team --dry-run
```

### 5.4 Redirect

```bash
# thử vài URL cũ → phải 301 về URL mới (thay host bằng frontend của bạn)
curl -sI https://example.com/2024/05/old-post/ | grep -iE '^(HTTP|location)'
```

Kiểm cả trailing slash và không có chuỗi redirect (A → B → C). Chi tiết quy tắc: [playbook › Redirect](./playbook.md#redirect-và-permalink).

## 6. Checklist nghiệm thu

- [ ] Số lượng posts/pages/products/taxonomies/media/menus/comments trong CMS = `staged/` (trừ phần cố ý xóa/bỏ).
- [ ] Idempotent: chạy lại `--from content --to content` ⇒ `created: 0, updated: 0`.
- [ ] 10 URL ngẫu nhiên + toàn bộ URL trong sitemap WP cũ: mở được hoặc redirect 301 đúng đích.
- [ ] Thân bài không còn Markdown thô, `[shortcode]`, chữ dính nhau; bảng và ảnh hiển thị đủ.
- [ ] Ảnh thực sự load được (HTTP 200 + trình duyệt decode), featured image đúng bài.
- [ ] Canonical/OG/robots đúng domain mới; không có `noindex` ngoài ý muốn (`seo.robots`).
- [ ] Ngày xuất bản/sửa đúng nguồn (không phải ngày import); thứ tự danh sách bài đúng.
- [ ] Menu header/footer/mobile đúng; link nội bộ không 404.
- [ ] Bình luận hiển thị đúng bài, spam không public.
- [ ] Site: logo, favicon, knowledge graph, social đúng; theme/footer/contact đã cấu hình trong admin.
- [ ] Sitemap/robots của frontend; Search Console / hreflang (nếu đa ngôn ngữ) đã cập nhật.
- [ ] Đã lưu: file `pg_dump`, thư mục `wp-archive/$SITE/` (raw + staged + `.gate-lock`).

## 7. Rollback

| Tình huống | Cách quay lại |
| --- | --- |
| Sai `staged/`, chưa import | Sửa `staged/`, lint, lock lại — không có gì để rollback |
| Import local/dev hỏng | `pnpm migrate:down` + `pnpm migrate` rồi import lại; hoặc xóa Site `$SITE` trong admin và chạy lại |
| Import vào DB không local hỏng | Khôi phục dump: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URI" backups-local/db-…-pre-wp-migration-$SITE.dump` (dừng app trước; cân nhắc restore vào DB mới rồi đổi `DATABASE_URI`) |
| Chỉ một vài doc sai | Admin → bản **Versions** của doc → *Restore*, hoặc sửa `staged/` và chạy lại đúng phase (idempotent) |
| Đã chuyển DNS nhưng lỗi nặng | Trỏ lại DNS về WordPress cũ — **giữ WordPress chạy** ít nhất 2–4 tuần sau cutover; chỉ tắt khi đã qua checklist |

Không bao giờ xóa `wp-archive/$SITE/raw/` hay file dump trước khi cutover ổn định.

## Tham chiếu mã nguồn

- [run-wp-migration.ts](../../src/importers/run-wp-migration.ts) · [wp-migration-config.ts](../../src/importers/wp-migration/wp-migration-config.ts)
- [staged-gate.ts](../../src/importers/wp-migration/staged-gate.ts) · [prod-backup-gate.ts](../../src/importers/wp-migration/prod-backup-gate.ts)
- [phase-content.ts](../../src/importers/wp-migration/phase-content.ts) · [phase-media.ts](../../src/importers/wp-migration/phase-media.ts) · [phase-redirects.ts](../../src/importers/wp-migration/phase-redirects.ts)
