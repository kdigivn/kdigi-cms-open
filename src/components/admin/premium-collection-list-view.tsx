import React from 'react'
import type { ListViewServerProps } from 'payload'
import { PremiumCollectionListClient } from './premium-collection-list-client'
import type { CollectionRowDTO } from './premium-collection-table'

export function PremiumCollectionListView(props: ListViewServerProps) {
  const rows: CollectionRowDTO[] = props.data.docs.map((doc: Record<string, unknown>) => {
    if (typeof doc.id !== 'string' && typeof doc.id !== 'number') throw new Error('Collection row is missing its document ID')
    const editing = doc._userEditing
    const editingId = editing && typeof editing === 'object' && 'id' in editing ? editing.id : undefined
    return {
      id: doc.id,
      _isLocked: Boolean(doc._isLocked),
      _userEditing: typeof editingId === 'string' || typeof editingId === 'number' ? { id: editingId } : undefined,
    }
  })

  return (
    <PremiumCollectionListClient
      rows={rows}
      AfterList={props.AfterList}
      AfterListTable={props.AfterListTable}
      BeforeList={props.BeforeList}
      BeforeListTable={props.BeforeListTable}
      beforeActions={props.beforeActions}
      collectionSlug={props.collectionSlug}
      columnState={props.columnState}
      Description={props.Description}
      disableBulkDelete={props.disableBulkDelete}
      disableBulkEdit={props.disableBulkEdit}
      disableQueryPresets={props.disableQueryPresets}
      enableRowSelections={props.enableRowSelections}
      hasCreatePermission={props.hasCreatePermission}
      hasDeletePermission={props.hasDeletePermission}
      hasTrashPermission={props.hasTrashPermission}
      listMenuItems={props.listMenuItems}
      newDocumentURL={props.newDocumentURL}
      queryPreset={props.queryPreset}
      queryPresetPermissions={props.queryPresetPermissions}
      renderedFilters={props.renderedFilters}
      resolvedFilterOptions={props.resolvedFilterOptions}
      Table={props.Table}
      viewType={props.viewType}
    />
  )
}
