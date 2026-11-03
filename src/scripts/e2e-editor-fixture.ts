/**
 * Shared constants + content for the Playwright editor fixture document
 * (SP2-1 / phase 4). Split out of `seed-e2e-admin.ts` for the same reason as
 * `e2e-admin-fixture.ts`: specs and the seed script must agree on the slug, and
 * importing the constants must never trigger the seed script's side effects.
 *
 * The body deliberately contains every block the Level-A editor surface can create
 * (H1–H6, paragraphs, bullet/ordered/task lists, code, quote, divider, link,
 * bold/italic, a GFM table) so specs can assert on real nodes
 * instead of driving the UI to build them first.
 */

/** Slug of the seeded fixture post — specs resolve the doc id from this, never hard-code it. */
export const E2E_EDITOR_FIXTURE_SLUG = 'e2e-editor-fixture'

/** siteKey of the tenant that owns the fixture post (local/CI only). */
export const E2E_FIXTURE_SITE_KEY = 'e2e-fixture'

/** Domain of the fixture tenant — a TEST-NET host so no revalidate request can escape. */
export const E2E_FIXTURE_SITE_DOMAIN = '192.0.2.10'

export const E2E_EDITOR_FIXTURE_TITLE = 'E2E editor fixture — không sửa tay'

/** Level-A block coverage: one of every block the editor can create. */
export const E2E_EDITOR_FIXTURE_MARKDOWN = `# Heading level 1

## Heading level 2

### Heading level 3

#### Heading level 4

##### Heading level 5

###### Heading level 6

Paragraph with **bold**, *italic* and a [link](https://example.com/).

- Bullet item one
- Bullet item two

1. Ordered item one
2. Ordered item two

- [ ] Task item not done
- [x] Task item done

> Blockquote line.

\`\`\`ts
const answer = 42
\`\`\`

---

| Column A | Column B |
| --- | --- |
| A1 | B1 |
`
