'use client'
/**
 * Folder navigation bar for the custom Media grid view.
 *
 * Presentational only — all fetching/mutation lives in MediaGridListView.
 * Renders a breadcrumb trail, the subfolders of the current folder (clickable to
 * descend), and an inline "new folder" form. Pairs with Payload's native
 * `folders: true` data model (the `payload-folders` collection + media.folder).
 */
import React, { useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { Home, Folder, FolderPlus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type FolderCrumb = { id: number; name: string }
export type SubFolder = { id: number; name: string }

type Props = {
  /** Breadcrumb trail from root (exclusive) to the current folder. */
  path: FolderCrumb[]
  /** Direct subfolders of the current folder. */
  subfolders: SubFolder[]
  busy: boolean
  canCreate?: boolean
  onRoot: () => void
  onCrumb: (index: number) => void
  onOpen: (folder: SubFolder) => void
  onCreate: (name: string) => void
}

export const MediaFolderBar: React.FC<Props> = ({
  path,
  subfolders,
  busy,
  canCreate = true,
  onRoot,
  onCrumb,
  onOpen,
  onCreate,
}) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setCreating(false)
  }

  return (
    <div className="twp mb-3.5">
      {/* Breadcrumb */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onRoot}
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[13px] transition-colors hover:bg-accent ${
            path.length === 0 ? 'font-bold text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Home className="size-3.5" /> {isEnglish ? 'Root folder' : 'Thư mục gốc'}
        </button>
        {path.map((c, i) => (
          <React.Fragment key={c.id}>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => onCrumb(i)}
              className={`rounded px-2 py-1 text-[13px] transition-colors hover:bg-accent ${
                i === path.length - 1 ? 'font-bold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {c.name}
            </button>
          </React.Fragment>
        ))}
        {canCreate && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setCreating(v => !v)}
        >
          <FolderPlus /> {isEnglish ? 'New folder' : 'Thư mục mới'}
        </Button>
        )}
      </div>

      {/* New-folder inline form */}
      {canCreate && creating && (
        <div className="mb-2.5 flex gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setCreating(false)
            }}
            aria-label={isEnglish ? 'Folder name' : 'Tên thư mục'}
            placeholder={isEnglish ? 'Folder name' : 'Tên thư mục'}
            className="min-h-10 min-w-0 flex-[0_1_240px] rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button variant="success" size="sm" onClick={submit} disabled={busy || !name.trim()}>
            {isEnglish ? 'Create' : 'Tạo'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating(false)
              setName('')
            }}
          >
            {isEnglish ? 'Cancel' : 'Huỷ'}
          </Button>
        </div>
      )}

      {/* Subfolder cards */}
      {subfolders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subfolders.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <Folder className="size-4 text-primary" />
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
