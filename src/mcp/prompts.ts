import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'write-post',
    {
      title: 'Write a new post',
      description: 'Research the site, then draft a new SEO-ready post as a draft.',
      argsSchema: {
        site: z.string().describe('siteKey'),
        topic: z.string().describe('What the post is about'),
        keyword: z.string().optional().describe('Main focus keyword'),
        locale: z.enum(['vi', 'en']).optional(),
      },
    },
    ({ site, topic, keyword, locale }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Write a new post on site "${site}" about: ${topic}.`,
              keyword ? `Focus keyword: ${keyword}.` : 'Pick one focus keyword.',
              `Locale: ${locale ?? 'vi'}.`,
              'Steps: search_content for existing posts on the topic (avoid duplicates, find internal links); list_taxonomies and list_shortcodes; read kcms://guide/content;',
              'write the Markdown body with headings, internal links and alt texts; create_post as draft with seo.title, seo.description and focusKeywords;',
              'run get_seo_report and fix what it flags; finally share the adminUrl from get_content_urls. Do not publish.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'refresh-seo',
    {
      title: 'Improve SEO of a document',
      description: 'Read a post/page, raise its SEO score, and save with optimistic concurrency.',
      argsSchema: {
        collection: z.enum(['posts', 'pages']),
        id: z.string().describe('Document id'),
      },
    },
    ({ collection, id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Improve the SEO of ${collection} #${id}.`,
              'get_content and get_seo_report first. Propose the changes (title, description, focus keywords, headings, alt texts) and wait for my OK.',
              'Then update with expectedUpdatedAt from get_content and re-run get_seo_report.',
            ].join('\n'),
          },
        },
      ],
    }),
  )
}
