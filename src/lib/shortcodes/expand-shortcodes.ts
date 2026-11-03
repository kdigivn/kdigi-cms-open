import type { Payload, PayloadRequest } from 'payload'

/**
 * `[sc name="x"/]` or `[sc name="x"][/sc]`. The optional backslashes accept the
 * Markdown-ESCAPED form: the Milkdown editor serializes a literal `[` in text as `\[`, so a tag
 * typed or inserted in the editor is stored as `\[sc name="x"/]` — without this the tag never
 * matched and the page showed it raw. The escape is consumed along with the tag.
 */
const SC_TAG_RE = /\\?\[sc\s+name=["']([a-z0-9-]+)["']\s*(?:\/\]|\]\s*\\?\[\/sc\])/g
const DEFAULT_MAX_DEPTH = 3

type ShortcodeValue = {
  contentMd?: string | null
}

type FetchShortcodesArgs = {
  locale?: PayloadRequest['locale']
  names: string[]
  payload: Payload
  req: PayloadRequest
  tenantId: number | string
}

export type ExpandShortcodesOptions = {
  fetchShortcodes?: (args: FetchShortcodesArgs) => Promise<Map<string, string>>
  locale?: PayloadRequest['locale']
  maxDepth?: number
  payload: Payload
  req: PayloadRequest
  tenantId?: number | string
}

function uniqueShortcodeNames(markdown: string): string[] {
  return Array.from(new Set(Array.from(markdown.matchAll(SC_TAG_RE), (match) => match[1]))).filter(Boolean)
}

async function replaceShortcodeTags(
  markdown: string,
  resolver: (name: string) => Promise<string>,
): Promise<string> {
  const matches = Array.from(markdown.matchAll(SC_TAG_RE))
  if (!matches.length) return markdown

  let out = ''
  let lastIndex = 0

  for (const match of matches) {
    const index = match.index ?? 0
    out += markdown.slice(lastIndex, index)
    out += await resolver(match[1] ?? '')
    lastIndex = index + match[0].length
  }

  out += markdown.slice(lastIndex)
  return out
}

async function defaultFetchShortcodes({
  locale,
  names,
  payload,
  req,
  tenantId,
}: FetchShortcodesArgs): Promise<Map<string, string>> {
  const result = await payload.find({
    collection: 'shortcodes',
    where: {
      and: [
        { name: { in: names } },
        { tenant: { equals: tenantId } },
      ],
    },
    locale,
    depth: 0,
    limit: names.length,
    overrideAccess: true,
    req,
  })

  return new Map(
    result.docs.flatMap((doc) => {
      const shortcode = doc as ShortcodeValue & { name?: string }
      if (!shortcode.name || typeof shortcode.contentMd !== 'string' || !shortcode.contentMd) {
        return []
      }
      return [[shortcode.name, shortcode.contentMd] as const]
    }),
  )
}

async function expandShortcodesRecursive(
  markdown: string,
  options: Required<Pick<ExpandShortcodesOptions, 'fetchShortcodes' | 'maxDepth'>> &
    Omit<ExpandShortcodesOptions, 'fetchShortcodes' | 'maxDepth'>,
  depth: number,
  visited: Set<string>,
): Promise<string> {
  if (!markdown || !markdown.includes('[sc')) return markdown
  if (!options.tenantId) return markdown

  const names = uniqueShortcodeNames(markdown)
  if (!names.length) return markdown

  const fetched = await options.fetchShortcodes({
    names,
    tenantId: options.tenantId,
    payload: options.payload,
    req: options.req,
    locale: options.locale,
  })

  const expandedCache = new Map<string, Promise<string>>()

  return replaceShortcodeTags(markdown, async (name) => {
    if (!name) return ''
    if (visited.has(name)) return ''
    if (depth >= options.maxDepth) return ''

    const content = fetched.get(name)
    if (!content) return ''

    let expanded = expandedCache.get(name)
    if (!expanded) {
      expanded = expandShortcodesRecursive(
        content,
        options,
        depth + 1,
        new Set([...visited, name]),
      )
      expandedCache.set(name, expanded)
    }

    const resolved = await expanded
    return resolved ? `\n\n${resolved}\n\n` : ''
  })
}

export async function expandShortcodesInMarkdown(
  markdown: string,
  options: ExpandShortcodesOptions,
): Promise<string> {
  if (!markdown || !markdown.includes('[sc')) return markdown
  if (!options.tenantId) return markdown

  return expandShortcodesRecursive(
    markdown,
    {
      ...options,
      fetchShortcodes: options.fetchShortcodes ?? defaultFetchShortcodes,
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    },
    0,
    new Set<string>(),
  )
}
