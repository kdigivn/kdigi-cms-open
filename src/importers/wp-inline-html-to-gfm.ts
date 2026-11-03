import TurndownService from 'turndown'

const converter = new TurndownService({ emDelimiter: '*', bulletListMarker: '-', headingStyle: 'atx' })
const punctuation = /^[\p{P}\p{S}]$/u
const word = /[^\s\p{P}\p{S}]/u

// CommonMark cannot close **label:** immediately before a letter, or open
// **[link](url)** immediately after one. Keep the inline HTML in those cases:
// inserting a space would change the source text, and literal ** loses the style.
converter.addRule('faithful-emphasis', {
  filter: ['strong', 'b', 'em', 'i'],
  replacement(content, node) {
    if (!content.trim()) return ''
    const strong = node.nodeName === 'STRONG' || node.nodeName === 'B'
    const tag = strong ? 'strong' : 'em'
    const marker = strong ? '**' : '*'
    const source = node.textContent ?? ''
    const before = /^\s/.test(source) ? ' ' : node.previousSibling?.textContent?.slice(-1) ?? ' '
    const after = /\s$/.test(source) ? ' ' : node.nextSibling?.textContent?.slice(0, 1) ?? ' '
    const ambiguous =
      (punctuation.test(content[0]) && word.test(before)) ||
      (punctuation.test(content.slice(-1)) && word.test(after)) ||
      (strong && content.includes('**'))
    return ambiguous ? `<${tag}>${content}</${tag}>` : `${marker}${content}${marker}`
  },
})

converter.addRule('source-image', {
  filter: 'img',
  replacement(_content, node) {
    const src = node.getAttribute('src')?.trim()
    if (!src) return ''
    const alt = (node.getAttribute('alt') ?? '').replace(/[[\]\r\n]+/g, ' ').trim()
    const url = src.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
    return `![${alt}](${url})`
  },
})
converter.remove(['script', 'style'])

/** Preserve DOM whitespace and nested inline markup; raw HTML only for ambiguous emphasis. */
export function inlineToMarkdown(html: string): string {
  return converter.turndown(html)
}
