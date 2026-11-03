'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getTranslation } from '@payloadcms/translations'
import {
  Gutter, ListControls, ListHeader, ListSelection, PageControls, RelationshipProvider,
  SelectMany, SelectionProvider, TableColumnsProvider, useConfig, useListDrawerContext,
  useBulkUpload, useListQuery, useModal, useSelection, useStepNav, useTranslation, useWindowInfo,
} from '@payloadcms/ui'
import type { ListViewClientProps, ClientCollectionConfig } from 'payload'
import { Inbox } from 'lucide-react'
import { CollectionStatusFilters } from './collection-status-filters'
import { PremiumCollectionTable, type CollectionRowDTO } from './premium-collection-table'
import { CollectionFloatingBulkBar } from './collection-floating-bulk-bar'
export type PremiumCollectionListClientProps = ListViewClientProps & { rows: CollectionRowDTO[] }

export function PremiumCollectionListClient({ rows, ...props }: PremiumCollectionListClientProps) {
  const { getEntityConfig, config } = useConfig()
  const collectionConfig = getEntityConfig({ collectionSlug: props.collectionSlug })
  const { data, isGroupingBy } = useListQuery()
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const { allowCreate, createNewDrawerSlug, isInDrawer, onBulkSelect } = useListDrawerContext()
  const { openModal } = useModal()
  const router = useRouter()
  const { drawerSlug: bulkUploadDrawerSlug, setCollectionSlug, setOnSuccess } = useBulkUpload()
  const openBulkUpload = () => {
    setCollectionSlug(props.collectionSlug)
    setOnSuccess(() => router.refresh())
    openModal(bulkUploadDrawerSlug)
  }
  const { setStepNav } = useStepNav()
  const { breakpoints: { s: smallBreak } } = useWindowInfo()
  const label = getTranslation(collectionConfig.labels.plural, i18n)
  const hasCreatePermission = props.hasCreatePermission && allowCreate !== false

  useEffect(() => {
    if (!isInDrawer) {
      setStepNav(props.viewType === 'trash'
        ? [{ label, url: `${config.routes.admin}/collections/${props.collectionSlug}` }, { label: i18n.t('general:trash') }]
        : [{ label }])
    }
  }, [config.routes.admin, i18n, isInDrawer, label, props.collectionSlug, props.viewType, setStepNav])

  const drawerActions = props.enableRowSelections && onBulkSelect
    ? [...(props.beforeActions ?? []), <SelectMany key="select-many" onClick={onBulkSelect} />]
    : props.beforeActions

  return (
    <TableColumnsProvider collectionSlug={props.collectionSlug} columnState={props.columnState}>
      <SelectionProvider docs={rows} totalDocs={data?.totalDocs ?? 0}>
        <div className={`collection-list collection-list--${props.collectionSlug} harbor-collection-list`}>
          {props.BeforeList}
          <Gutter className="harbor-collection-list__gutter">
            <header className="harbor-list-heading">
              <ListHeader
                collectionConfig={collectionConfig}
                Description={props.Description}
                disableBulkDelete={props.disableBulkDelete}
                disableBulkEdit={props.disableBulkEdit}
                hasCreatePermission={hasCreatePermission}
                hasDeletePermission={props.hasDeletePermission}
                hasTrashPermission={props.hasTrashPermission}
                i18n={i18n}
                isBulkUploadEnabled={Boolean(collectionConfig.upload && collectionConfig.upload.bulkUpload)}
                isTrashEnabled={Boolean(collectionConfig.trash)}
                newDocumentURL={props.newDocumentURL}
                openBulkUpload={openBulkUpload}
                smallBreak={smallBreak}
                viewType={props.viewType}
              />
            </header>
            {props.viewType !== 'trash' && <div className="twp"><CollectionStatusFilters collectionSlug={props.collectionSlug} /></div>}
            <section className="harbor-list-workspace">
              <div className="harbor-list-toolbar">
                <ListControls
                  beforeActions={drawerActions}
                  collectionConfig={collectionConfig}
                  collectionSlug={props.collectionSlug}
                  disableQueryPresets={collectionConfig.enableQueryPresets !== true || props.disableQueryPresets}
                  listMenuItems={props.listMenuItems}
                  queryPreset={props.queryPreset}
                  queryPresetPermissions={props.queryPresetPermissions}
                  renderedFilters={props.renderedFilters}
                  resolvedFilterOptions={props.resolvedFilterOptions}
                />
              </div>
              {props.BeforeListTable}
              {rows.length > 0 ? (
                <RelationshipProvider>
                  {isGroupingBy || collectionConfig.orderable ? props.Table : <PremiumCollectionTable enableRowSelections={props.enableRowSelections} rows={rows} />}
                </RelationshipProvider>
              ) : (
                <div className="twp flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <Inbox aria-hidden="true" className="size-9 text-muted-foreground" />
                  <h2 className="m-0 text-lg font-semibold text-foreground">
                    {props.viewType === 'trash' ? (isEnglish ? 'Trash is empty' : 'Thùng rác trống') : (isEnglish ? 'No matching records' : 'Không có tài liệu phù hợp')}
                  </h2>
                  <p className="m-0 max-w-md text-sm text-muted-foreground">
                    {props.viewType === 'trash' ? (isEnglish ? 'Deleted records appear here.' : 'Tài liệu đã xóa sẽ xuất hiện tại đây.') : (isEnglish ? 'Adjust your search or filters, or create a record.' : 'Điều chỉnh từ khóa, bộ lọc hoặc tạo tài liệu mới.')}
                  </p>
                  {hasCreatePermission && props.viewType !== 'trash' && isInDrawer && createNewDrawerSlug && (
                    <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" type="button" onClick={() => openModal(createNewDrawerSlug)}>
                      {isEnglish ? 'Create new' : 'Tạo mới'}
                    </button>
                  )}
                </div>
              )}
              {props.AfterListTable}
              {rows.length > 0 && (
                <footer className="harbor-list-footer">
                  {!isGroupingBy && <PageControls collectionConfig={collectionConfig} />}
                </footer>
              )}
            </section>
          </Gutter>
          {props.AfterList}
          {props.enableRowSelections && (
            <FloatingBulkBarBridge
              collectionConfig={collectionConfig}
              disableBulkDelete={props.disableBulkDelete}
              disableBulkEdit={props.disableBulkEdit}
              hasDeletePermission={props.hasDeletePermission}
              hasTrashPermission={props.hasTrashPermission}
              isEnglish={isEnglish}
              label={label}
              viewType={props.viewType}
            />
          )}
        </div>
      </SelectionProvider>
    </TableColumnsProvider>
  )
}

function FloatingBulkBarBridge({
  collectionConfig,
  disableBulkDelete,
  disableBulkEdit,
  hasDeletePermission,
  hasTrashPermission,
  isEnglish,
  label,
  viewType,
}: {
  collectionConfig: ClientCollectionConfig
  disableBulkDelete?: boolean
  disableBulkEdit?: boolean
  hasDeletePermission?: boolean
  hasTrashPermission?: boolean
  isEnglish: boolean
  label: string
  viewType?: string
}) {
  const { count, toggleAll, totalDocs } = useSelection()

  return (
    <CollectionFloatingBulkBar
      count={count}
      totalDocs={totalDocs}
      isEnglish={isEnglish}
      onClearSelection={() => toggleAll(false)}
      onSelectAll={() => toggleAll(true)}
    >
      <ListSelection
        collectionConfig={collectionConfig}
        disableBulkDelete={disableBulkDelete}
        disableBulkEdit={disableBulkEdit}
        hasDeletePermission={hasDeletePermission}
        hasTrashPermission={hasTrashPermission}
        label={label}
        showSelectAllAcrossPages={false}
        viewType={viewType}
      />
    </CollectionFloatingBulkBar>
  )
}
