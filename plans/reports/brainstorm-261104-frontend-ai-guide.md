---
type: brainstorm
date: 2026-11-04
topic: Hướng dẫn AI coding agent dựng frontend dùng KDIGI CMS
status: approved
modes: []
---

# Brainstorm: AI dựng frontend cho KDIGI CMS

## 1. Vấn đề (problem-first)

- Đề xuất gốc: "hướng dẫn cho vibe coder ra lệnh AI code website".
- Vấn đề thật: AI coding agent không biết hợp đồng REST, các bẫy (tenant filter, depth, auth → lộ draft, webhook revalidate, route phải khớp `publicPathFor`), và config riêng của site (tenant id, locale, menu, pageGroup) → đoán → site chạy nhưng sai: lộ nháp, sai locale, cache không bao giờ refresh, "View on site" gãy.
- Hai persona khác nhau, không trộn:

| Persona | Kênh | Hiện trạng |
|---|---|---|
| Biên tập dùng AI | MCP + CLI + skill `kcms` | có |
| Vibe coder dựng web | docs hợp đồng + context site + skill frontend | **thiếu** |

- Frontend runtime KHÔNG gọi MCP: `/api/mcp` là bề mặt ghi có key; gắn key vào REST trả draft (`docs/rest-api.md` §Ground rules). MCP chỉ dùng lúc dev.
- Evidence: weak (ý kiến nội bộ), nhưng chi phí thấp và lỗi mô tả trên có căn cứ trong docs.

### Giả định cần kiểm

| Giả định | Rủi ro nếu sai | Kiểm |
|---|---|---|
| Skill + KCMS.md đủ để AI sinh code đúng | AI vẫn sai ở tầng fetch → cần SDK (hướng C) | Smoke 5 framework từ 1 prompt |
| `sites`/`menus` đọc ẩn danh đủ dữ liệu cho context | Phải dùng key → rủi ro lộ | Chạy `context` trên `seed:demo` không key |
| AI đọc `KCMS.md` khi được nhắc trong prompt/AGENTS | Bỏ qua file | Smoke dùng prompt 1 câu chuẩn |

## 2. Scout (ràng buộc)

- `docs/rest-api.md` = hợp đồng frontend (anonymous read, `where[tenant][equals]`, `depth`, locale vi/en, HTML ở key gốc, `seo`, menus theo `location`, `env-page`, comments/ratings, redirects, GraphQL raw shape).
- Webhook bắt buộc `POST https://{domain}/api/cms/revalidate`; route công khai `src/lib/frontend-public-path.ts`.
- Docker image không có `docs/` → llms.txt phải sinh lúc build vào `public/`.
- `--with-skill` boolean, cứng `skills/kcms` (`packages/kcms-cli/src/commands/setup.ts`, `scripts/bundle-skill.mjs`, `setup-targets.ts` `skillDir`).
- Không có SDK, starter, llms.txt; `src/payload-types.ts` nội bộ.

## 3. Phương án

| | Mô tả | Ưu | Nhược |
|---|---|---|---|
| A | Chỉ docs + prompt mẫu | rẻ | AI không tự thấy; không context site |
| **B (chọn)** | Skill frontend + llms.txt + `kcms frontend context` | đúng chỗ AI đọc; context thật; tái dùng setup | thêm 1 lệnh, 1 build step, skill phải đồng bộ docs |
| C | B + SDK typed + 5 starter | DX tốt nhất | bảo trì 6 artifact, release theo schema; YAGNI |

C hoãn: chỉ làm khi smoke B cho thấy AI vẫn sai ở tầng code.

## 4. Giải pháp chốt

1. **`skills/kcms-frontend/`** (EN)
   - `SKILL.md`: quy tắc bắt buộc (anonymous, không key trong code, tenant filter, depth/select, HTML key gốc, `seo.*` + `seo.jsonLd.raw`, menus, `env-page`, redirects, route khớp `publicPathFor`, webhook revalidate, locale, comments/ratings); phần dev: MCP được tra cứu + tạo draft fixture, cấm publish/trash.
   - `references/`: `nextjs.md`, `astro.md`, `sveltekit.md`, `nuxt.md`, `spa.md` (Angular/React SPA: cảnh báo SEO, khuyên prerender/SSR), `checklist.md` (tự kiểm trước khi báo xong).
   - Trỏ section `rest-api.md`, không chép lại hợp đồng.
2. **`/llms.txt`, `/llms-full.txt`** trên host CMS: `src/scripts/generate-llms.ts` (`pnpm generate:llms`) ghép `rest-api.md`, `seo.md`, skill frontend → `public/`; file sinh ra được commit; drift test trong `pnpm test` (plan chốt thay cho build step).
3. **`kcms frontend context --url <cms> --site <siteKey> [-o KCMS.md]`**: REST ẩn danh, không key. Ghi: base URL, siteKey, tenant id, domain, defaultLanguage, locale có bản dịch, menu location có dữ liệu, pageGroup, đếm doc theo collection, JSON mẫu rút gọn mỗi loại, quy tắc route, URL webhook. Không ghi secret; không sửa AGENTS/CLAUDE của user, chỉ in gợi ý 1 dòng.
4. **`kcms setup <target> --with-skill [kcms,kcms-frontend]`**: không giá trị = `kcms` (tương thích ngược); bundle cả hai skill.
5. **Docs song ngữ** `docs/frontend-with-ai.md` (3 bước, prompt mẫu từng framework, lỗi AI hay mắc) + cập nhật `README*.md`, `docs/ai-integration.md`, `docs/rest-api.md` (link), `packages/kcms-cli/README.md`, `CHANGELOG.md` Unreleased.

### Luồng vibe coder

```bash
npm i -g @kdigi/kcms-cli
export KCMS_API_KEY=change-me            # user role author/editor, chỉ dùng lúc dev
kcms setup claude-code --write --with-skill kcms,kcms-frontend
kcms frontend context --url https://cms.example.com --site my-blog
# prompt: "Build a Next.js site for KDIGI CMS site my-blog. Follow skill kcms-frontend and KCMS.md."
```

## 5. Ngoài phạm vi

SDK `@kdigi/kcms-client`, starter templates, OAuth cho MCP, llms.txt theo site, tool MCP mới, thay đổi hợp đồng REST.

## 6. Nghiệm thu

1. Smoke **cả 5 framework** (Next.js App Router, Astro, SvelteKit, Nuxt, Angular/React SPA): agent mới, thư mục trống, chỉ skill + `KCMS.md` + 1 prompt → site:
   - chỉ bài published (không Authorization header);
   - render HTML content;
   - metadata từ `seo`, JSON-LD từ `seo.jsonLd.raw`;
   - menu `PRIMARY`, trang chủ qua `env-page?key=FRONT_PAGE`;
   - `POST /api/cms/revalidate` → 2xx; sửa bài trong admin → trang đổi (SPA: ghi nhận không áp dụng / prerender rebuild);
   - route khớp "View on site";
   - `vi` + `en`.
2. `curl <cms>/llms.txt` → 200; drift test fail khi docs đổi mà chưa regenerate.
3. `kcms frontend context` chạy trên `pnpm seed:demo`; unit test: output không chứa key, siteKey sai → lỗi rõ, exit code chuẩn CLI.
4. `kcms setup … --with-skill` không giá trị vẫn chỉ cài `kcms` (test setup-targets).
5. `pnpm lint && pnpm typecheck && pnpm test` xanh.

## 7. Rủi ro

- Skill lệch docs → mitigate: skill trỏ section, llms drift test.
- 5 reference framework lỗi thời theo version framework → ghi version đã smoke trong mỗi reference.
- Webhook không auth (`rest-api.md`) → skill nhắc handler idempotent, rẻ, rate-limit ở edge.
- Vibe coder dán key vào code frontend → skill + docs cấm rõ; `context` không cần key.
- Smoke 5 framework tốn thời gian/token → chạy song song từng framework.

## 8. Touchpoints

`skills/kcms-frontend/**` (mới), `scripts/generate-llms.mjs` (mới), `public/llms*.txt` (sinh), `package.json` (build script), `packages/kcms-cli/src/commands/{setup,frontend}.ts`, `packages/kcms-cli/src/setup-targets.ts`, `packages/kcms-cli/scripts/bundle-skill.mjs`, `packages/kcms-cli/src/cli.ts`, docs liệt kê ở §4.5, `CHANGELOG.md`.
