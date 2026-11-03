'use client'
import React from 'react'
import { useTranslation } from '@payloadcms/ui'

export type FolderOption = { id: number; name: string }
interface Props {
  currentFolder: number | null
  folders: FolderOption[]
  onMove: (folderId: number | null) => void
}

export function MediaMoveSelect({ currentFolder, folders, onMove }: Props) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  return (
    <select
      aria-label={isEnglish ? 'Move file to folder' : 'Di chuyển tệp vào thư mục'}
      title={isEnglish ? 'Move file to folder' : 'Di chuyển tệp vào thư mục'}
      defaultValue=""
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation()
        const value = event.target.value
        event.target.value = ''
        if (value === '') return
        onMove(value === 'root' ? null : Number(value))
      }}
      className="min-h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="" disabled>{isEnglish ? 'Move to…' : 'Di chuyển vào…'}</option>
      {currentFolder != null && <option value="root">{isEnglish ? 'Root folder' : 'Thư mục gốc'}</option>}
      {folders.filter((folder) => folder.id !== currentFolder).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
    </select>
  )
}
