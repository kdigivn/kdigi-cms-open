/**
 * Canonical GFM fixture shared by the markdown pipeline's unit tests
 * (Phase 9 — GFM Round-Trip and Shared Field Integration).
 *
 * Exercises every construct the shared Milkdown editor is expected to
 * support: H1-H6, bold, italic, strikethrough, link, inline code, fenced
 * code, blockquote, divider, bullet/ordered/task lists (incl. nesting),
 * image, a GFM table with all three column alignments, and shortcode
 * syntax. Kept as plain CommonMark/GFM text — this is what the `{name}Md`
 * textarea field actually stores (see `markdown-html-field.ts`).
 *
 * Only ONE constant is exported by design (Phase 9 spec: "one canonical
 * GFM fixture") so every test in this phase runs the exact same input.
 */
export const CANONICAL_GFM_FIXTURE = [
  '# Heading 1',
  '## Heading 2',
  '### Heading 3',
  '#### Heading 4',
  '##### Heading 5',
  '###### Heading 6',
  '',
  'Paragraph with **bold text**, *italic text*, ~~strikethrough text~~, and `inline code`.',
  '',
  'See the [KDIGI CMS site](https://example.com) for details.',
  '',
  '```ts',
  'const routeCount: number = 42',
  '```',
  '',
  '> A blockquote spanning',
  '> two lines.',
  '',
  '---',
  '',
  '- Bullet one',
  '- Bullet two',
  '  - Nested bullet',
  '',
  '1. Ordered one',
  '2. Ordered two',
  '',
  '- [ ] Unchecked todo',
  '- [x] Checked todo',
  '',
  '![A boat leaving the pier](https://cdn.example.com/photo.jpg)',
  '',
  '| Left | Center | Right |',
  '| :--- | :----: | ----: |',
  '| a1   | b1     | c1    |',
  '| a2   | b2     | c2    |',
  '',
  '[sc name="gia-ve-cao-toc"][/sc]',
  '',
].join('\n')
