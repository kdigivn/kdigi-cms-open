'use client'
/**
 * Single sortable row in the menu tree builder.
 * Live projection: projectedDepth (active row) shifts the indent spacer in real time;
 * dropLineDepth (over-target row) renders a 2px blue line at the projected landing depth.
 * Active row stays visible at reduced opacity — no DragOverlay ghost needed.
 * Children of a deleted node are promoted to parent level (confirm dialog fires).
 */
import React, { useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MenuNode } from '../../lib/menu-tree-types'
import type { FlatNode } from './menu-tree-utils'
import { INDENT_WIDTH } from './menu-tree-utils'
import { labelStyle, inputStyle, arrowBtnStyle, indentBtnStyle } from './menu-tree-styles'

interface MenuTreeRowProps {
  flat: FlatNode
  activeLang: 'vi' | 'en'
  isActive: boolean
  /** True when the pointer is over this row (and it is not the dragged item). */
  isDropTarget: boolean
  /** Active row only: live depth from horizontal drag offset — shifts the indent spacer. */
  projectedDepth?: number
  /** Over-target row only: renders a 2px horizontal drop-line at this depth. */
  dropLineDepth?: number
  canIndent: boolean
  canOutdent: boolean
  onUpdate: (id: string, patch: Partial<Pick<MenuNode, 'label' | 'url'>>) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onIndent: (id: string) => void
  onOutdent: (id: string) => void
}

export const MenuTreeRow: React.FC<MenuTreeRowProps> = ({
  flat, activeLang, isActive, isDropTarget, projectedDepth, dropLineDepth,
  canIndent, canOutdent,
  onUpdate, onDelete, onMoveUp, onMoveDown, onIndent, onOutdent,
}) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [expanded, setExpanded] = useState(false)
  const { node, depth } = flat

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: flat.id,
  })

  // Active row: visible at reduced opacity + blue left accent. isDragging is true
  // only for the row being dragged (from useSortable).
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    // Blue left border accent signals "this is the item in flight"
    borderLeft: isDragging ? '3px solid var(--theme-brand)' : '3px solid transparent',
  }

  // Live depth during drag; committed depth otherwise.
  const displayDepth = projectedDepth !== undefined ? projectedDepth : depth

  const label = node.label[activeLang] || node.label.vi || node.label.en || (isEnglish ? '(no label)' : '(chưa có nhãn)')

  return (
    <div ref={setNodeRef} style={dragStyle} data-id={flat.id}>
      {/* Drop-line: 2px line indented to dropLineDepth, above the over-target row. */}
      {isDropTarget && dropLineDepth !== undefined && (
        <div
          aria-hidden
          style={{
            height: 2,
            background: 'var(--theme-brand)',
            marginLeft: dropLineDepth * INDENT_WIDTH + 32, // 32px = drag handle width
            borderRadius: 1,
            marginBottom: -1, // overlap with row top border so it reads as "between" rows
          }}
        />
      )}

      {/* Row bar */}
      <div className="kdigi-menu-row" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px 6px 0',
        borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
        background: expanded ? 'var(--theme-elevation-50, #f9fafb)' : 'transparent',
        // Smooth horizontal transition as projectedDepth changes during drag
        transition: isDragging ? 'none' : undefined,
      }}>
        {/* Drag handle */}
        <button type="button" aria-label={isEnglish ? 'Drag to reorder' : 'Kéo để sắp xếp'} {...listeners} {...attributes}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', background: 'none', border: 'none', padding: '0 4px', color: 'var(--theme-elevation-400, #9ca3af)', flexShrink: 0, lineHeight: 1 }}>
          &#8942;&#8942;
        </button>

        {/* Indent spacer: displayDepth updates every drag-move frame for live feedback. */}
        {displayDepth > 0 && (
          <span className="kdigi-menu-indent" aria-hidden style={{ width: displayDepth * INDENT_WIDTH, flexShrink: 0, alignSelf: 'stretch', display: 'flex' }}>
            <span style={{
              marginLeft: (displayDepth - 1) * INDENT_WIDTH + 10,
              borderLeft: `2px solid ${isDragging ? 'var(--theme-brand)' : 'var(--theme-elevation-200)'}`,
              width: INDENT_WIDTH - 10,
            }} />
          </span>
        )}

        {/* Expand/collapse chevron */}
        <button type="button" aria-label={expanded ? (isEnglish ? 'Collapse' : 'Thu gọn') : (isEnglish ? 'Edit' : 'Chỉnh sửa')} onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--theme-elevation-500, #6b7280)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease', flexShrink: 0, lineHeight: 1 }}>
          &#9656;
        </button>

        {/* Label + URL preview */}
        <span className="kdigi-menu-label" style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
          <strong style={{ color: node.label.vi ? 'inherit' : 'var(--theme-error-500)' }}>{label}</strong>
          {node.url && node.url !== '#' && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--theme-elevation-400, #9ca3af)' }}>{node.url}</span>
          )}
        </span>

        {/* Depth badge — shows projected level during drag so it's always legible */}
        {displayDepth > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 10,
            background: isDragging ? 'var(--theme-brand)' : 'var(--theme-elevation-100)',
            color: isDragging ? '#fff' : 'var(--theme-elevation-500, #6b7280)',
            flexShrink: 0,
          }}>
            L{displayDepth + 1}
          </span>
        )}

        {/* Indent / outdent — deterministic nesting without horizontal drag */}
        <button type="button" aria-label={isEnglish ? 'Outdent' : 'Lùi cấp'} title={isEnglish ? 'Outdent' : 'Lùi cấp'}
          onClick={() => onOutdent(node.id)} disabled={!canOutdent} style={indentBtnStyle(canOutdent)}>
          &#8592;
        </button>
        <button type="button" aria-label={isEnglish ? 'Indent' : 'Thụt cấp'} title={isEnglish ? 'Nest under the previous item' : 'Thành mục con của hàng trên'}
          onClick={() => onIndent(node.id)} disabled={!canIndent} style={indentBtnStyle(canIndent)}>
          &#8594;
        </button>

        {/* Delete */}
        <button type="button" aria-label={`${isEnglish ? 'Delete' : 'Xoá'} ${label}`}
          onClick={() => {
            if (node.children.length === 0 || window.confirm(isEnglish ? `Delete "${label}"? Children will be promoted to this level.` : `Xoá "${label}"? Các mục con sẽ được chuyển lên cấp này.`)) {
              onDelete(node.id)
            }
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-elevation-400, #9ca3af)', padding: '0 4px', flexShrink: 0, lineHeight: 1, fontSize: 14 }}
          title={isEnglish ? 'Delete (children promoted)' : 'Xoá (chuyển các mục con lên một cấp)'}>
          &times;
        </button>
      </div>

      {expanded && (
        <div className="kdigi-menu-row-fields" style={{ marginLeft: displayDepth * INDENT_WIDTH + 32, padding: '8px 12px', background: 'var(--theme-elevation-50, #f9fafb)', borderBottom: '1px solid var(--theme-elevation-150, #e5e7eb)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ ...labelStyle, flex: '1 1 160px', minWidth: 0 }}>
              {isEnglish ? 'Label (VI)' : 'Nhãn (VI)'}
              <input type="text" value={node.label.vi ?? ''} aria-label={isEnglish ? 'Label Vietnamese' : 'Nhãn tiếng Việt'}
                onChange={e => onUpdate(node.id, { label: { ...node.label, vi: e.target.value } })}
                placeholder="Tên menu tiếng Việt" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: '1 1 160px', minWidth: 0 }}>
              {isEnglish ? 'Label (EN)' : 'Nhãn (EN)'}
              <input type="text" value={node.label.en ?? ''} aria-label={isEnglish ? 'Label English' : 'Nhãn tiếng Anh'}
                onChange={e => onUpdate(node.id, { label: { ...node.label, en: e.target.value } })}
                placeholder={isEnglish ? 'Menu label in English' : 'Tên mục bằng tiếng Anh'} style={inputStyle} />
            </label>
          </div>
          <label style={labelStyle}>
            URL
            <input type="text" value={node.url} aria-label="URL"
              onChange={e => onUpdate(node.id, { url: e.target.value })}
              placeholder={isEnglish ? '/path or https://...' : '/duong-dan hoặc https://...'} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} />
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button type="button" onClick={() => onMoveUp(node.id)} style={arrowBtnStyle} aria-label={isEnglish ? 'Move up' : 'Di chuyển lên'}>&#8593; {isEnglish ? 'Up' : 'Lên'}</button>
            <button type="button" onClick={() => onMoveDown(node.id)} style={arrowBtnStyle} aria-label={isEnglish ? 'Move down' : 'Di chuyển xuống'}>&#8595; {isEnglish ? 'Down' : 'Xuống'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
