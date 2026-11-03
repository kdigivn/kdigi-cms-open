'use client'
/**
 * WordPress-style menu tree builder — DndContext wrapper + locale toggle.
 * Live projection UX: getProjection(flat, activeId, overId, delta.x) computes the
 * target depth on every pointer move; the active row's indent shifts in real time
 * and a 2px drop-line appears at the projected depth on the over-target row.
 * No DragOverlay — the row itself is the feedback surface.
 */
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import type { DragStartEvent, DragMoveEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { MenuNode } from '../../lib/menu-tree-types'
import {
  flattenTree, unflattenTree, moveFlatNodes, clampDepth,
  updateNode, removeNode, newNode, INDENT_WIDTH,
} from './menu-tree-utils'
import { getProjection } from './menu-tree-projection'
import type { Projection } from './menu-tree-projection'
import { MenuTreeRow } from './menu-tree-row'
import { localeTabStyle } from './menu-tree-styles'

interface MenuTreeBuilderProps {
  value: MenuNode[]
  onChange: (tree: MenuNode[]) => void
}

export const MenuTreeBuilder: React.FC<MenuTreeBuilderProps> = ({ value, onChange }) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [activeLang, setActiveLang] = useState<'vi' | 'en'>('vi')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const [projected, setProjected] = useState<Projection | null>(null)

  const flat = useMemo(() => flattenTree(value), [value])
  const flatIds = useMemo(() => flat.map(f => f.id), [flat])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const onDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id)
    setOverId(id)
    setDragOffsetX(0)
    setProjected(null)
  }, [])

  // Every pointer-move: recompute projected depth so the row indent updates live.
  const onDragMove = useCallback((e: DragMoveEvent) => {
    const dx = e.delta.x
    const currentOverId = e.over ? String(e.over.id) : (activeId ?? '')
    setDragOffsetX(dx)
    setOverId(currentOverId)
    if (activeId && currentOverId) {
      setProjected(getProjection(flat, activeId, currentOverId, dx))
    }
  }, [flat, activeId])

  // Pointer crosses into a new droppable — keep overId in sync.
  const onDragOver = useCallback((e: DragOverEvent) => {
    const currentOverId = e.over ? String(e.over.id) : (activeId ?? '')
    setOverId(currentOverId)
    if (activeId && currentOverId) {
      setProjected(getProjection(flat, activeId, currentOverId, dragOffsetX))
    }
  }, [flat, activeId, dragOffsetX])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e
    const finalProjected = projected
    setActiveId(null)
    setOverId(null)
    setDragOffsetX(0)
    setProjected(null)
    if (!over) return

    const activeIdx = flat.findIndex(f => f.id === active.id)
    const overIdx = flat.findIndex(f => f.id === over.id)
    if (activeIdx === -1 || overIdx === -1) return

    // Prefer live projected depth; fall back to delta-based calc if projection was null.
    let resolvedDepth: number
    if (finalProjected !== null) {
      resolvedDepth = finalProjected.depth
    } else {
      const depthSteps = Math.round(dragOffsetX / INDENT_WIDTH)
      if (active.id === over.id && depthSteps === 0) return
      const rawDepth = depthSteps + flat[activeIdx].depth
      resolvedDepth = clampDepth(rawDepth, flat, overIdx)
    }

    if (active.id === over.id && resolvedDepth === flat[activeIdx].depth) return

    onChange(unflattenTree(moveFlatNodes(flat, activeIdx, overIdx, resolvedDepth)))
  }, [flat, projected, dragOffsetX, onChange])

  const handleUpdate = useCallback(
    (id: string, patch: Partial<Pick<MenuNode, 'label' | 'url'>>) => onChange(updateNode(value, id, patch)),
    [value, onChange],
  )
  const handleDelete = useCallback(
    (id: string) => onChange(removeNode(value, id)),
    [value, onChange],
  )
  const handleMoveUp = useCallback((id: string) => {
    const idx = flat.findIndex(f => f.id === id)
    if (idx <= 0) return
    onChange(unflattenTree(moveFlatNodes(flat, idx, idx - 1, flat[idx].depth)))
  }, [flat, onChange])

  const handleMoveDown = useCallback((id: string) => {
    const idx = flat.findIndex(f => f.id === id)
    if (idx === -1 || idx >= flat.length - 1) return
    onChange(unflattenTree(moveFlatNodes(flat, idx, idx + 1, flat[idx].depth)))
  }, [flat, onChange])

  const handleIndent = useCallback((id: string) => {
    const idx = flat.findIndex(f => f.id === id)
    if (idx <= 0) return
    const target = clampDepth(flat[idx].depth + 1, flat, idx)
    if (target === flat[idx].depth) return
    onChange(unflattenTree(moveFlatNodes(flat, idx, idx, target)))
  }, [flat, onChange])

  const handleOutdent = useCallback((id: string) => {
    const idx = flat.findIndex(f => f.id === id)
    if (idx === -1 || flat[idx].depth === 0) return
    onChange(unflattenTree(moveFlatNodes(flat, idx, idx, flat[idx].depth - 1)))
  }, [flat, onChange])

  // Pass projected depth only to the active row; others render at committed depth.
  const getRowProjectedDepth = useCallback((id: string): number | undefined => {
    if (id !== activeId || projected === null) return undefined
    return projected.depth
  }, [activeId, projected])

  return (
    <div className="kdigi-menu-tree">
      {/* Locale toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {(['vi', 'en'] as const).map(lang => (
          <button key={lang} type="button" onClick={() => setActiveLang(lang)} style={localeTabStyle(activeLang === lang)}>
            {lang}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--theme-elevation-400, #9ca3af)', alignSelf: 'center', marginLeft: 8 }}>
          {isEnglish ? `Previewing ${activeLang === 'vi' ? 'Vietnamese' : 'English'} labels` : `Xem nhãn ${activeLang === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}`}
        </span>
      </div>

      {/* Empty state */}
      {flat.length === 0 && (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--theme-elevation-400, #9ca3af)', fontSize: 13, border: '1px dashed var(--theme-elevation-200, #d1d5db)', borderRadius: 4, marginBottom: 12 }}>
          {isEnglish ? 'No menu items yet — add a menu item below.' : 'Chưa có mục điều hướng — thêm mục bên dưới.'}
        </div>
      )}

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
          <div style={{ border: flat.length > 0 ? '1px solid var(--theme-elevation-150, #e5e7eb)' : 'none', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            {flat.map((f, i) => (
              <MenuTreeRow
                key={f.id}
                flat={f}
                activeLang={activeLang}
                isActive={f.id === activeId}
                isDropTarget={f.id === overId && f.id !== activeId}
                projectedDepth={getRowProjectedDepth(f.id)}
                dropLineDepth={f.id === overId && activeId !== null && projected !== null ? projected.depth : undefined}
                canIndent={i > 0 && clampDepth(f.depth + 1, flat, i) > f.depth}
                canOutdent={f.depth > 0}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button type="button" onClick={() => onChange([...value, newNode()])}
        style={{ padding: '6px 14px', border: '1px solid var(--theme-elevation-300, #9ca3af)', borderRadius: 4, background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'inherit' }}>
        + {isEnglish ? 'Add menu item' : 'Thêm mục điều hướng'}
      </button>
    </div>
  )
}
