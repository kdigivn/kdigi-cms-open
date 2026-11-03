const icon = (body: string) =>
  `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

const text = (value: string, fontSize = 10) =>
  icon(
    `<text x="8" y="11" text-anchor="middle" font-size="${fontSize}" font-family="Inter Variable, Inter, sans-serif" font-weight="600" fill="currentColor">${value}</text>`,
  )

const heading = (level: number) => text(`H${level}`, level >= 4 ? 6.3 : 7)

export const milkdownTextIcon = text('T', 10)
export const milkdownHeading1Icon = heading(1)
export const milkdownHeading2Icon = heading(2)
export const milkdownHeading3Icon = heading(3)
export const milkdownHeading4Icon = heading(4)
export const milkdownHeading5Icon = heading(5)
export const milkdownHeading6Icon = heading(6)
export const milkdownQuoteIcon = icon(
  '<path d="M5.7 4.5H3.6A1.6 1.6 0 0 0 2 6.1v2.3A1.6 1.6 0 0 0 3.6 10h2.1A1.6 1.6 0 0 0 7.3 8.4V5.9A1.4 1.4 0 0 1 8.7 4.5h.1V3.2h-.1A2.7 2.7 0 0 0 6 5.9v2.5c0 .2-.1.3-.3.3H3.6c-.2 0-.3-.1-.3-.3V6.1c0-.2.1-.3.3-.3h2.1V4.5Zm6 0H9.6A1.6 1.6 0 0 0 8 6.1v2.3A1.6 1.6 0 0 0 9.6 10h2.1a1.6 1.6 0 0 0 1.6-1.6V5.9a1.4 1.4 0 0 1 1.4-1.4h.1V3.2h-.1A2.7 2.7 0 0 0 12 5.9v2.5c0 .2-.1.3-.3.3H9.6c-.2 0-.3-.1-.3-.3V6.1c0-.2.1-.3.3-.3h2.1V4.5Z" fill="currentColor"/>',
)
export const milkdownBulletListIcon = icon(
  '<circle cx="3" cy="4" r="1.2" fill="currentColor"/><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="3" cy="12" r="1.2" fill="currentColor"/><path d="M6 4h7M6 8h7M6 12h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
)
export const milkdownOrderedListIcon = icon(
  '<path d="M2.4 4h1.5M2.4 8h1.5M2.4 12h1.5M6 4h7M6 8h7M6 12h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.2 2.9h1V5M2.2 6.7h1a.8.8 0 0 1 .8.8c0 .2-.1.5-.3.6l-1.5 1.4h1.8M2.2 10.7h1.2a.7.7 0 0 1 0 1.4H2.3" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownTaskListIcon = icon(
  '<rect x="2.2" y="2.8" width="2.6" height="2.6" rx=".4" stroke="currentColor" stroke-width="1.2"/><rect x="2.2" y="6.8" width="2.6" height="2.6" rx=".4" stroke="currentColor" stroke-width="1.2"/><rect x="2.2" y="10.8" width="2.6" height="2.6" rx=".4" stroke="currentColor" stroke-width="1.2"/><path d="M6.4 4.1H13M6.4 8.1H13M6.4 12.1H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="m2.9 8.1.7.7 1.4-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownImageIcon = icon(
  '<rect x="2" y="2.5" width="12" height="11" rx="1.6" stroke="currentColor" stroke-width="1.2"/><circle cx="5.2" cy="5.7" r="1.2" fill="currentColor"/><path d="m4 11 2.7-2.8 2 1.9 1.8-1.8L12 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownCodeBlockIcon = icon(
  '<path d="M6.3 4.5 2.7 8l3.6 3.5M9.7 11.5 13.3 8 9.7 4.5M6.7 13.1 9.3 2.9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownDividerIcon = icon(
  '<path d="M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="13.4" cy="8" r="1.1" fill="currentColor"/><path d="M3 11.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="13.4" cy="11.5" r="1.1" fill="currentColor"/>',
)
export const milkdownLinkIcon = icon(
  '<path d="M6.4 10.7 5.1 12a2.1 2.1 0 1 0 3 3l1.3-1.3M9.6 5 11 3.7a2.1 2.1 0 0 1 3 3l-1.3 1.3M6.9 9.1l2.2-2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownTableIcon = icon(
  '<rect x="2.5" y="3" width="11" height="10" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 6.3h11M2.5 9.7h11M6.2 3v10M9.8 3v10" stroke="currentColor" stroke-width="1.1"/>',
)

/**
 * Inline-mark icons for the floating selection toolbar (Lark parity —
 * plan.md phase-04 "Lark Docs Parity"). Same 16x16 viewBox / ~1.2px stroke /
 * currentColor line-icon language as the block-type icons above, but drawn as
 * proper glyph outlines rather than raw text characters (unlike the heading
 * icons, which intentionally stay `<text>` — see `heading()` above).
 */
export const milkdownBoldIcon = icon(
  '<path d="M5 3.4h3.7a2.3 2.3 0 0 1 0 4.6H5m0 0h4.1a2.4 2.4 0 0 1 0 4.8H5V3.4Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>',
)
export const milkdownItalicIcon = icon(
  '<path d="M6.6 3.6h4M5.2 12.4h4M9.4 3.6 6.4 12.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
)
export const milkdownStrikethroughIcon = icon(
  '<path d="M3.4 8h9.2M9.7 4.9c-.5-.7-1.5-1.1-2.6-1.1-1.7 0-3 .9-3 2.1 0 .8.5 1.4 1.5 1.8M6.3 11.1c.5.7 1.5 1.1 2.6 1.1 1.7 0 3-.9 3-2.1 0-.3-.1-.6-.3-.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
export const milkdownInlineCodeIcon = icon(
  '<path d="M6.4 5.4 3.6 8l2.8 2.6M9.6 5.4 12.4 8l-2.8 2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)

/**
 * Block-menu trigger icon (Lark parity — the trailing `⠿` grid button on the
 * floating selection toolbar). A 3x3 dot grid, same `currentColor`-fill
 * language as `milkdownBulletListIcon`'s dots above, reused here as a
 * second entry point into the SAME "Turn into" dropdown the `T▾` trigger
 * opens (see `milkdown-selection-toolbar.tsx`) — not a new menu.
 */
export const milkdownBlockGridIcon = icon(
  '<circle cx="4.4" cy="4.4" r="1.1" fill="currentColor"/><circle cx="8" cy="4.4" r="1.1" fill="currentColor"/><circle cx="11.6" cy="4.4" r="1.1" fill="currentColor"/><circle cx="4.4" cy="8" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="11.6" cy="8" r="1.1" fill="currentColor"/><circle cx="4.4" cy="11.6" r="1.1" fill="currentColor"/><circle cx="8" cy="11.6" r="1.1" fill="currentColor"/><circle cx="11.6" cy="11.6" r="1.1" fill="currentColor"/>',
)
