'use client'

import React, { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { CheckSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CollectionFloatingBulkBarProps {
  count: number
  totalDocs?: number
  isEnglish: boolean
  onClearSelection: () => void
  onSelectAll?: () => void
  children?: React.ReactNode
}

const emptySubscribe = () => () => {}

export const CollectionFloatingBulkBar: React.FC<CollectionFloatingBulkBarProps> = ({
  count,
  totalDocs,
  isEnglish,
  onClearSelection,
  onSelectAll,
  children,
}) => {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && count > 0 && !document.querySelector('[role="dialog"], .drawer--is-open')) {
        onClearSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [count, onClearSelection])

  if (!mounted || count === 0 || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="twp pointer-events-none fixed inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] z-30 flex justify-center sm:inset-x-4 sm:bottom-6">
          <div
            role="region"
            aria-label={isEnglish ? 'Bulk actions' : 'Thao tác hàng loạt'}
            className="pointer-events-auto flex max-h-[45dvh] max-w-full flex-wrap items-center justify-center gap-2 overflow-y-auto rounded-xl border border-border bg-card p-2 text-foreground shadow-xl"
          >
            <div className="flex items-center gap-2 px-2.5 py-1">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CheckSquare className="size-3.5" />
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {count} {isEnglish ? 'selected' : 'đã chọn'}
              </span>
              {totalDocs && totalDocs > count && onSelectAll && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="ml-1 min-h-11 text-xs text-primary hover:underline"
                >
                  ({isEnglish ? `Select all ${totalDocs}` : `Chọn tất cả ${totalDocs}`})
                </button>
              )}
            </div>


            <div className="flex max-w-full flex-wrap items-center justify-center gap-2 harbor-floating-actions">
              {children}
            </div>


            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="min-h-11 gap-1 px-3 text-xs text-muted-foreground hover:text-foreground"
              aria-label={isEnglish ? 'Clear selection (Esc)' : 'Bỏ chọn (Esc)'}
            >
              <X className="size-3.5" />
              <span>{isEnglish ? 'Clear' : 'Bỏ chọn'}</span>
            </Button>
          </div>
    </div>,
    document.body,
  )
}
