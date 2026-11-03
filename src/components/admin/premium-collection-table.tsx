'use client'

import React from 'react'
import { SelectAll, useAuth, useSelection, useTableColumns, useTranslation } from '@payloadcms/ui'
import { LockKeyhole } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getTranslation } from '@payloadcms/translations'
export interface CollectionRowDTO {
  id: string | number
  _isLocked?: boolean
  _userEditing?: { id: string | number }
}

interface PremiumCollectionTableProps {
  enableRowSelections?: boolean
  rows: CollectionRowDTO[]
}

export function PremiumCollectionTable({ enableRowSelections, rows }: PremiumCollectionTableProps) {
  const { columns } = useTableColumns()
  const { user } = useAuth()
  const { selected, setSelection } = useSelection()
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const activeColumns = columns.filter((column) => column.active)

  return (
    <div className="twp harbor-table-scroll" tabIndex={0} role="region" aria-label={isEnglish ? 'Collection table; scroll horizontally for more columns' : 'Bảng tài liệu; cuộn ngang để xem thêm cột'}>
      <table className="harbor-table">
        <thead>
          <tr>
            {enableRowSelections && <th scope="col" className="harbor-table__selection"><SelectAll /></th>}
            {activeColumns.map((column, columnIndex) => {
              const heading = column.Heading
              // Payload 3.90 localizes visible labels, but interpolates the raw
              // label object into sort-button aria-labels. Resolve at this boundary.
              const localizedHeading = React.isValidElement<{ label?: string | Record<string, string> }>(heading) && heading.props.label
                ? React.cloneElement(heading, { label: getTranslation(heading.props.label, i18n) })
                : heading
              return <th key={column.accessor} scope="col" className={columnIndex === 0 || column.accessor === 'title' || column.accessor === 'name' ? 'harbor-table__primary' : undefined}>{localizedHeading}</th>
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isSelected = Boolean(selected.get(row.id))
            return (
              <tr
                key={row.id}
                className={cn(
                  'transition-colors hover:bg-muted/40',
                  isSelected && 'row--selected bg-primary/[0.04] dark:bg-primary/[0.08]'
                )}
              >
                {enableRowSelections && (
                  <td className="harbor-table__selection">
                    {row._isLocked && row._userEditing && row._userEditing.id !== user?.id ? (
                      <span role="img" aria-label={isEnglish ? 'Document locked by another user' : 'Tài liệu đang được người khác chỉnh sửa'}><LockKeyhole aria-hidden="true" size={16} /></span>
                    ) : (
                      <label className="flex size-11 items-center justify-center cursor-pointer">
                        <Checkbox
                          aria-label={`${isEnglish ? 'Select record' : 'Chọn tài liệu'} ${row.id}`}
                          checked={isSelected}
                          onCheckedChange={() => setSelection(row.id)}
                          className="size-4 rounded border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </label>
                    )}
                  </td>
                )}
                {activeColumns.map((column, columnIndex) => (
                  <td key={column.accessor} className={columnIndex === 0 || column.accessor === 'title' || column.accessor === 'name' ? 'harbor-table__primary' : undefined}>{column.renderedCells[index]}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
