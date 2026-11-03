/**
 * Lexical-to-HTML converter for heading nodes (h1–h4).
 *
 * `defaultHTMLConverters` from @payloadcms/richtext-lexical only handles
 * paragraph/text/linebreak/tab. Without this converter, heading nodes stored
 * in Lexical JSON serialize to the string "unknown node" in REST responses,
 * stripping all section headings from content served to the frontend.
 *
 * Inline formatting (bold, italic) inside headings is rendered by delegating
 * to the text converter already in the converters stack.
 */

import type { HTMLConverter } from '@payloadcms/richtext-lexical'

// Payload's HTMLConverter<T> requires T extends SerializedLexicalNode from the
// `lexical` package, which is not a direct workspace dependency. We bypass the
// generic by casting to HTMLConverter<any> — the runtime contract is identical.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const headingHTMLConverter: HTMLConverter<any> = {
  nodeTypes: ['heading'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async converter({ converters, childIndex: _ci, currentDepth, depth, draft, node, overrideAccess, parent, req, showHiddenFields }: any) {
    const tag: string = node.tag ?? 'h2'
    // Render inline children (text/bold/italic) via the existing converter stack.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childResults: string[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node.children as any[]).map(async (child: any, childIndex: number) => {
        const childConverter = converters.find((c: HTMLConverter<any>) => c.nodeTypes?.includes(child.type as string))
        if (!childConverter) return typeof child.text === 'string' ? child.text : ''
        return childConverter.converter({
          childIndex,
          converters,
          currentDepth: currentDepth + 1,
          depth,
          draft,
          node: child,
          overrideAccess,
          parent: node,
          req,
          showHiddenFields,
        })
      }),
    )
    return `<${tag}>${childResults.join('')}</${tag}>`
  },
}
