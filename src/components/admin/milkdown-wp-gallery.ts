'use client'

/**
 * WordPress's two-column gallery is block HTML, not Markdown. Milkdown's
 * built-in `html` node is inline-only, so a gallery div would otherwise be
 * dropped while parsing or flattened into separate image nodes. This narrow
 * node keeps the source block as one atom and serializes its original bytes
 * unchanged; only the editor preview is reconstructed from safe DOM nodes.
 */

import { $nodeSchema, $remark } from '@milkdown/kit/utils'

const GALLERY_CLASS = 'gallery'
const GALLERY_COLUMNS_CLASS = 'gallery-columns-2'
const GALLERY_ITEM_CLASS = 'gallery-item'
const GALLERY_ICON_CLASS = 'gallery-icon'
const GALLERY_CAPTION_CLASS = 'gallery-caption'

function classAttribute(attributes: string): string {
  const match = attributes.match(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}


/** Match only the real WP block surface; generic HTML remains Milkdown's own node. */
function isWordPressTwoColumnGallery(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const open = value.match(/^\s*<div\b([^>]*)>/i)
  const classes = open ? classAttribute(open[1]).split(/\s+/) : []
  if (!open || !classes.includes(GALLERY_CLASS) || !classes.includes(GALLERY_COLUMNS_CLASS)) return false
  if (!/<\/div>\s*$/i.test(value)) return false
  for (const figure of value.matchAll(/<figure\b([^>]*)>/gi)) {
    if (classAttribute(figure[1]).split(/\s+/).includes(GALLERY_ITEM_CLASS)) return true
  }
  return false
}

function safeImageSource(source: string): boolean {
  const value = source.trim()
  if (!value) return false
  // Relative WordPress/R2 paths are safe to resolve against the editor origin.
  if (/^(?:\/|\.\.?\/)/.test(value)) return true
  try {
    const protocol = new URL(value, document.baseURI).protocol.toLowerCase()
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function safeClassNames(raw: string, required: string[]): string {
  const tokens = required.slice()
  for (const token of raw.split(/\s+/)) {
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(token) && !tokens.includes(token)) tokens.push(token)
  }
  return tokens.join(' ')
}

function setSafeImageAttribute(
  image: HTMLImageElement,
  name: 'alt' | 'title' | 'width' | 'height' | 'loading',
  value: string | null,
): void {
  if (value == null) return
  if ((name === 'width' || name === 'height') && !/^\d+$/.test(value)) return
  if (name === 'loading' && value !== 'lazy' && value !== 'eager') return
  // setAttribute never parses the value as markup; event/style attributes are
  // intentionally not copied from source HTML.
  image.setAttribute(name, value)
}

function unavailableGalleryPreview(): HTMLElement {
  const preview = document.createElement('div')
  preview.className = `${GALLERY_CLASS} ${GALLERY_COLUMNS_CLASS}`
  preview.setAttribute('data-wp-gallery', 'invalid')
  preview.textContent = 'Gallery preview unavailable'
  return preview
}

/** Build preview DOM without assigning untrusted HTML to innerHTML. */
function galleryPreview(raw: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(raw, 'text/html')
  const source = parsed.body.firstElementChild
  if (!(source instanceof HTMLElement) || source.tagName !== 'DIV') return unavailableGalleryPreview()
  if (!source.classList.contains(GALLERY_CLASS) || !source.classList.contains(GALLERY_COLUMNS_CLASS)) {
    return unavailableGalleryPreview()
  }

  const preview = document.createElement('div')
  preview.className = safeClassNames(source.getAttribute('class') ?? '', [GALLERY_CLASS, GALLERY_COLUMNS_CLASS])
  const rawId = source.getAttribute('id')
  if (rawId && /^[A-Za-z][A-Za-z0-9:_.-]*$/.test(rawId)) preview.id = rawId
  preview.setAttribute('data-wp-gallery', 'true')
  preview.contentEditable = 'false'

  for (const sourceFigure of source.children) {
    if (!(sourceFigure instanceof HTMLElement) || sourceFigure.tagName !== 'FIGURE') continue
    if (!sourceFigure.classList.contains(GALLERY_ITEM_CLASS)) continue

    const sourceIcon = sourceFigure.querySelector(':scope > div.gallery-icon')
    const sourceImage = sourceIcon?.querySelector(':scope > img')
    if (!(sourceImage instanceof HTMLImageElement)) continue
    const sourceSrc = sourceImage.getAttribute('src') ?? ''
    if (!safeImageSource(sourceSrc)) continue

    const figure = document.createElement('figure')
    figure.className = safeClassNames(sourceFigure.getAttribute('class') ?? '', [GALLERY_ITEM_CLASS])
    const icon = document.createElement('div')
    icon.className = safeClassNames(sourceIcon?.getAttribute('class') ?? '', [GALLERY_ICON_CLASS])
    const image = document.createElement('img')
    image.setAttribute('src', sourceSrc.trim())
    setSafeImageAttribute(image, 'alt', sourceImage.getAttribute('alt'))
    setSafeImageAttribute(image, 'title', sourceImage.getAttribute('title'))
    setSafeImageAttribute(image, 'width', sourceImage.getAttribute('width'))
    setSafeImageAttribute(image, 'height', sourceImage.getAttribute('height'))
    setSafeImageAttribute(image, 'loading', sourceImage.getAttribute('loading'))
    icon.append(image)
    figure.append(icon)

    const sourceCaption = sourceFigure.querySelector(':scope > figcaption')
    if (sourceCaption) {
      const caption = document.createElement('figcaption')
      caption.className = safeClassNames(sourceCaption.getAttribute('class') ?? '', [GALLERY_CAPTION_CLASS])
      sourceCaption.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach((element) => element.remove())
      caption.textContent = sourceCaption.textContent ?? ''
      figure.append(caption)
    }
    preview.append(figure)
  }

  return preview.childElementCount ? preview : unavailableGalleryPreview()
}

/** Retag gallery HTML before Milkdown's generic inline `html` schema sees it. */
type GalleryRemarkNode = {
  type: string
  value?: unknown
  children?: GalleryRemarkNode[]
}

export const wpGalleryRemarkPlugin = $remark('wpGalleryRemark', () => () => (tree) => {
  const visit = (node: GalleryRemarkNode): void => {
    if (node.type === 'html' && isWordPressTwoColumnGallery(node.value)) node.type = 'wp_gallery'
    const children = node.children
    if (!children) return
    children.forEach(visit)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const paragraph = children[index]
      const gallery = paragraph.children?.[0]
      if (paragraph.type === 'paragraph' && paragraph.children?.length === 1 && gallery?.type === 'wp_gallery') {
        children[index] = gallery
      }
    }
  }
  visit(tree as GalleryRemarkNode)
})

export const wpGallerySchema = $nodeSchema('wp_gallery', () => ({
  atom: true,
  group: 'block',
  isolating: true,
  selectable: true,
  attrs: {
    html: {
      default: '',
      validate: 'string',
    },
  },
  toDOM: (node) => galleryPreview(node.attrs.html),
  parseMarkdown: {
    match: (node) => node.type === 'wp_gallery',
    runner: (state, node, type) => state.addNode(type, { html: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wp_gallery',
    runner: (state, node) => state.addNode('html', undefined, node.attrs.html),
  },
}))
