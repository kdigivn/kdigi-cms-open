# kcms Markdown file format

`kcms posts get <id|slug> -o file.md` writes a document as YAML frontmatter + Markdown body. `kcms posts update file.md` sends back only what changed; `kcms posts create file.md` creates a new document. `pages` work the same way.

```markdown
---
id: 123                      # absent on create
collection: posts
site: example                # siteKey
locale: vi                   # vi | en
title: "Hello"
slug: hello                  # derived from the title when omitted on create
status: draft                # draft | published
publishedAt: null            # ISO date; future + published = scheduled
featuredImage: 45            # media id, or a local image path (uploaded on create/update)
type: blog                   # posts: blog | news | guide
excerpt: "Short summary"     # posts only
categories:                  # posts only; replaces the whole list
  - { type: category, slug: news }
  - { type: tag, slug: ai }
author: 3                    # posts only; id of an author of the same site, or null
pageType: default            # pages only: default | blog | landing
isPillarPage: false          # pages only
seo:
  title: "40–60 characters"
  description: "100–160 characters"
  focusKeywords: [hello]
  canonicalOverride: ""      # absolute URL, or empty
updatedAt: 2026-11-03T10:00:00.000Z   # concurrency token — do not edit by hand
bodySource: markdown         # informational: markdown | legacy-converted | empty
---

## Body in Markdown
```

Rules:

- Unknown keys (and post-only keys in a page file) are refused with exit code 2.
- `update` needs `id` and `updatedAt`. If the document changed on the server since `updatedAt`, it fails with exit code 4 and writes nothing: run `get -o` again, re-apply the edit, retry. On success the file's `updatedAt` is rewritten.
- `bodySource: legacy-converted` → `update` with a changed body needs `--ack-legacy`. An empty body needs `--clear-body`.
- `seo` keys not present in the file are left unchanged on the server.
