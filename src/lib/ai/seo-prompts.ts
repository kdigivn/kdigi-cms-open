/**
 * Per-field SEO prompt builders for "Tạo bằng AI" feature.
 *
 * Each builder returns an OpenAI-compatible messages array ready to pass to
 * chatJson(). Prompts enforce:
 *   - Vietnamese output (tiếng Việt)
 *   - Length targets per field type (mirrors RankMath / Google's guidance)
 *   - Focus keyword inclusion (natural, not stuffed)
 *   - JSON output schema so chatJson can parse deterministically
 *
 * Length targets (characters, not words — Vietnamese words are shorter):
 *   title       : 40–65 chars  (Google SERP truncates ~65)
 *   description : 100–165 chars (Google truncates ~165)
 *   faq.answer  : 50–300 chars per answer
 *   alt         : ≤125 chars   (WCAG + SEO best practice)
 */
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ─── Shared context type ──────────────────────────────────────────────────────

export interface SeoDocContext {
  /** Primary document title (e.g. product or post title) */
  docTitle: string
  /** Plain-text excerpt of the document body (trimmed to first ~500 chars) */
  docContent?: string
  /** Primary focus keyword/phrase */
  focusKeyword?: string
}

// ─── JSON schema hints (passed as chatJson schemaHint) ────────────────────────

/**
 * Schema strings given to chatJson as schemaHint for each field type.
 * Compact JSON-schema descriptions — DeepSeek uses these to shape the output.
 */
export const SEO_FIELD_SCHEMAS: Record<string, string> = {
  title: '{ "suggestion": "string (40-65 chars, tiếng Việt)" }',
  description: '{ "suggestion": "string (100-165 chars, tiếng Việt)" }',
  faq: '{ "items": [ { "question": "string", "answer": "string" } ] }',
  alt: '{ "suggestion": "string (≤125 chars, tiếng Việt)" }',
}

// ─── Shared system instruction ─────────────────────────────────────────────────

const SYSTEM_VN =
  'Bạn là chuyên gia SEO tiếng Việt. Viết nội dung tự nhiên, không nhồi nhét từ khóa, ' +
  'phù hợp với người dùng tìm kiếm bằng tiếng Việt. Luôn trả lời bằng JSON hợp lệ.'

// ─── buildTitlePrompt ─────────────────────────────────────────────────────────

/**
 * Builds a chatJson messages array for SEO title generation.
 * Target: 40–65 characters in Vietnamese.
 */
export function buildTitlePrompt(ctx: SeoDocContext): ChatCompletionMessageParam[] {
  const { docTitle, docContent = '', focusKeyword = '' } = ctx

  const userMsg = [
    `Tạo một tiêu đề SEO tiếng Việt cho trang sau:`,
    `Tiêu đề bài viết: ${docTitle}`,
    focusKeyword ? `Từ khóa chính: ${focusKeyword}` : '',
    docContent ? `Nội dung tóm tắt: ${docContent.slice(0, 400)}` : '',
    '',
    `Yêu cầu:`,
    `- Độ dài: 40–65 ký tự (bao gồm khoảng trắng)`,
    `- Viết bằng tiếng Việt tự nhiên`,
    `- Chứa từ khóa chính (nếu có) một cách tự nhiên`,
    `- Không kết thúc bằng dấu chấm`,
    `- Trả về JSON: { "suggestion": "tiêu đề ở đây" }`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: SYSTEM_VN },
    { role: 'user', content: userMsg },
  ]
}

// ─── buildDescriptionPrompt ───────────────────────────────────────────────────

/**
 * Builds a chatJson messages array for SEO meta description generation.
 * Target: 100–165 characters in Vietnamese.
 */
export function buildDescriptionPrompt(ctx: SeoDocContext): ChatCompletionMessageParam[] {
  const { docTitle, docContent = '', focusKeyword = '' } = ctx

  const userMsg = [
    `Tạo một mô tả meta SEO tiếng Việt cho trang sau:`,
    `Tiêu đề bài viết: ${docTitle}`,
    focusKeyword ? `Từ khóa chính: ${focusKeyword}` : '',
    docContent ? `Nội dung tóm tắt: ${docContent.slice(0, 500)}` : '',
    '',
    `Yêu cầu:`,
    `- Độ dài: 100–165 ký tự (bao gồm khoảng trắng)`,
    `- Viết bằng tiếng Việt tự nhiên, hấp dẫn`,
    `- Chứa từ khóa chính (nếu có) một cách tự nhiên`,
    `- Tóm tắt lợi ích/nội dung trang để người dùng muốn click`,
    `- Trả về JSON: { "suggestion": "mô tả ở đây" }`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: SYSTEM_VN },
    { role: 'user', content: userMsg },
  ]
}

// ─── buildFaqPrompt ───────────────────────────────────────────────────────────

export interface FaqPromptContext extends SeoDocContext {
  /** Number of FAQ items to generate (default: 3) */
  count?: number
}

/**
 * Builds a chatJson messages array for FAQ generation.
 * Returns { items: [{ question, answer }] } array.
 */
export function buildFaqPrompt(ctx: FaqPromptContext): ChatCompletionMessageParam[] {
  const { docTitle, docContent = '', focusKeyword = '', count = 3 } = ctx

  const userMsg = [
    `Tạo ${count} câu hỏi thường gặp (FAQ) bằng tiếng Việt cho trang sau:`,
    `Tiêu đề bài viết: ${docTitle}`,
    focusKeyword ? `Từ khóa chính: ${focusKeyword}` : '',
    docContent ? `Nội dung tóm tắt: ${docContent.slice(0, 500)}` : '',
    '',
    `Yêu cầu:`,
    `- Tạo đúng ${count} câu hỏi`,
    `- Câu hỏi phải thực tế, người dùng hay thắc mắc`,
    `- Câu trả lời: 50–300 ký tự mỗi câu, rõ ràng và hữu ích`,
    `- Viết bằng tiếng Việt tự nhiên`,
    `- Trả về JSON: { "items": [ { "question": "...", "answer": "..." } ] }`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: SYSTEM_VN },
    { role: 'user', content: userMsg },
  ]
}

// ─── buildAltPrompt ───────────────────────────────────────────────────────────

export interface AltPromptContext extends SeoDocContext {
  /** Optional description of what the image shows */
  imageContext?: string
}

/**
 * Builds a chatJson messages array for image alt text generation.
 * Target: ≤125 characters in Vietnamese.
 */
export function buildAltPrompt(ctx: AltPromptContext): ChatCompletionMessageParam[] {
  const { docTitle, focusKeyword = '', imageContext = '' } = ctx

  const userMsg = [
    `Tạo văn bản thay thế (alt text) tiếng Việt cho ảnh trên trang sau:`,
    `Tiêu đề bài viết: ${docTitle}`,
    focusKeyword ? `Từ khóa chính: ${focusKeyword}` : '',
    imageContext ? `Mô tả ảnh: ${imageContext}` : '',
    '',
    `Yêu cầu:`,
    `- Độ dài tối đa: 125 ký tự`,
    `- Mô tả nội dung ảnh cụ thể, tự nhiên`,
    `- Có thể chứa từ khóa nếu phù hợp với nội dung ảnh`,
    `- Viết bằng tiếng Việt`,
    `- Không bắt đầu bằng "Ảnh chụp..." hay "Hình ảnh..."`,
    `- Trả về JSON: { "suggestion": "alt text ở đây" }`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: SYSTEM_VN },
    { role: 'user', content: userMsg },
  ]
}
