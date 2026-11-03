import React from 'react'
import { DefaultEditView } from '@payloadcms/ui'
import type { DocumentViewServerProps } from 'payload'

export function PremiumEditView(props: DocumentViewServerProps) {
  const collectionSlug = props.initPageResult.collectionConfig?.slug

  return (
    <div className={`harbor-edit-workspace${collectionSlug === 'sites' ? ' harbor-edit-workspace--settings' : ''}${collectionSlug === 'users' ? ' harbor-edit-workspace--profile' : ''}`}>
      <DefaultEditView
        BeforeDocumentControls={props.BeforeDocumentControls}
        Description={props.Description}
        EditMenuItems={props.EditMenuItems}
        LivePreview={props.LivePreview}
        PreviewButton={props.PreviewButton}
        PublishButton={props.PublishButton}
        SaveButton={props.SaveButton}
        SaveDraftButton={props.SaveDraftButton}
        Status={props.Status}
        UnpublishButton={props.UnpublishButton}
        Upload={props.Upload}
        UploadControls={props.UploadControls}
        documentSubViewType={props.documentSubViewType}
        formState={props.formState}
        viewType={props.viewType}
      />
    </div>
  )
}
