'use client'

/**
 * Block handle plugin view (phase 5, SP2-2) — the ProseMirror side of the owned handle.
 *
 * Mirrors Crepe's `handle/index.ts` exactly where it matters: it configures
 * `@milkdown/kit/plugin/block` (`BlockProvider` positions the handle next to the
 * hovered/selected top-level block and, because `BlockProvider` sets
 * `element.draggable = true`, upstream owns the drag/reorder + drop indicator). This
 * file exists only because disabling Crepe's `BlockEdit` feature also removes its
 * `BlockHandleView`; the positioning rules below are copied from it verbatim so the
 * geometry the suite already verifies does not change.
 *
 * The `+` action is Crepe's: insert an empty paragraph after the ACTIVE block, put the
 * caret in it, hide the handle, then let the caller open the slash menu there — which
 * is how the owned menu gets an "insert block below" entry point.
 */

import type { Ctx, EditorView, ProseMirrorNode, ResolvedPos } from './milkdown-vendor'
import { $prose, paragraphSchema, Plugin, PluginKey, TextSelection } from './milkdown-vendor'
import type { PluginView } from './milkdown-vendor'
import { BlockProvider, type BlockProviderOptions } from '@milkdown/kit/plugin/block'

/** Plugin key so the slice is identifiable in the editor's plugin list. */
const blockHandlePluginKey = new PluginKey('kdigi-block-handle')

export interface MilkdownBlockHandlePluginOptions {
  /** Called with the host element the React handle must portal into. */
  mountHandle: (host: HTMLElement) => void
  /** Called once with the `+` action, which the React button invokes. */
  onViewReady?: (api: { addBlockBelow: () => void }) => void
  /** Called after `+` inserted the paragraph and moved the caret — open the slash menu. */
  onAdd: () => void
}

/** Placement rules copied from Crepe's `BlockHandleView` (see module doc). */
function resolvePlacement(
  args: Parameters<NonNullable<BlockProviderOptions['getPlacement']>>[0],
): 'left' | 'left-start' {
  const { active, blockDom } = args
  if (active.node.type.name === 'heading') return 'left'
  let totalDescendant = 0
  active.node.descendants((node) => {
    totalDescendant += node.childCount
  })
  const dom = active.el
  const domRect = dom.getBoundingClientRect()
  const handleRect = blockDom.getBoundingClientRect()
  const style = window.getComputedStyle(dom)
  const paddingTop = Number.parseInt(style.paddingTop, 10) || 0
  const paddingBottom = Number.parseInt(style.paddingBottom, 10) || 0
  const height = domRect.height - paddingTop - paddingBottom
  return totalDescendant > 2 || handleRect.height < height ? 'left-start' : 'left'
}

/** The subset of `BlockProvider['active']` this plugin needs. */
interface HoveredBlock {
  node: ProseMirrorNode
  $pos: ResolvedPos
}

class BlockHandleView implements PluginView {
  readonly #ctx: Ctx
  readonly #options: MilkdownBlockHandlePluginOptions
  /**
   * The editor view, handed over by ProseMirror's own `view` hook.
   *
   * Do NOT `ctx.get(editorViewCtx)` here: the ctx value is written *while* the view is
   * being created, so reading it in a view factory throws and the editor never mounts
   * (measured: the e2e global-setup preflight failed with "the Milkdown editor never
   * produced a document").
   */
  readonly #view: EditorView
  readonly #content: HTMLElement
  readonly #provider: BlockProvider
  /**
   * Last block the pointer was over.
   *
   * `BlockProvider.active` is NOT reliable at click time: the handle sits inside the
   * editor's hit area, so the pointermove that brings the cursor onto the handle makes
   * upstream emit `hide` → `active` becomes `null` *before* the click's `pointerup`.
   * Measured with the `+` button: the handler fired with `hasActive: false`, so `+` did
   * nothing at all (15 blocks before, 15 after). Upstream's own hover computation is
   * cheap to mirror (one `posAtCoords` per pointermove, no allocation per event beyond
   * the resolved position) and this cache is only consulted when `active` is `null`.
   */
  #lastHovered: HoveredBlock | null = null
  readonly #trackHover: (event: PointerEvent) => void

  constructor(ctx: Ctx, options: MilkdownBlockHandlePluginOptions, editorView: EditorView) {
    this.#ctx = ctx
    this.#options = options
    this.#view = editorView
    const content = document.createElement('div')
    this.#content = content
    options.mountHandle(content)
    this.#provider = new BlockProvider({
      ctx,
      content,
      getOffset: () => 16,
      getPlacement: (args) => resolvePlacement(args),
    })
    this.#provider.update()

    const liveView = this.#view
    this.#trackHover = (event: PointerEvent): void => {
      const coords = liveView.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!coords) return
      const $pos = liveView.state.doc.resolve(coords.pos)
      if ($pos.depth < 1) return
      this.#lastHovered = {
        node: $pos.node(1),
        $pos: liveView.state.doc.resolve($pos.before(1)),
      }
    }
    liveView.dom.addEventListener('pointermove', this.#trackHover)

    options.onViewReady?.({ addBlockBelow: this.addBlockBelow })
  }

  update = (): void => {
    this.#provider.update()
  }

  destroy = (): void => {
    this.#view.dom.removeEventListener('pointermove', this.#trackHover)
    this.#provider.destroy()
    this.#content.remove()
  }

  /** Crepe's `onAdd`, unchanged in effect: new empty paragraph below, caret in it. */
  addBlockBelow = (): void => {
    const ctx = this.#ctx
    const view = this.#view
    if (!view.hasFocus()) view.focus()
    const active = (this.#provider.active as HoveredBlock | null) ?? this.#lastHovered
    if (!active) return
    const pos = active.$pos.pos + active.node.nodeSize
    let tr = view.state.tr.insert(pos, paragraphSchema.type(ctx).create())
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
    view.dispatch(tr.scrollIntoView())
    this.#provider.hide()
    this.#options.onAdd()
  }
}

/**
 * Registers the handle. `$prose((ctx) => …)` is how Milkdown hands the editor ctx to a
 * plugin factory (same shape as `createMilkdownSlashMenuPlugin`); the plugin key keeps
 * the slice identifiable in the editor's plugin list.
 */
export function createMilkdownBlockHandlePlugin(options: MilkdownBlockHandlePluginOptions): ReturnType<typeof $prose> {
  return $prose(
    (ctx) =>
      new Plugin({
        key: blockHandlePluginKey,
        // ProseMirror hands the live view to this hook — see the `#view` field doc for
        // why it must not come from the Milkdown ctx instead.
        view: (editorView) => new BlockHandleView(ctx, options, editorView),
      }),
  )
}
