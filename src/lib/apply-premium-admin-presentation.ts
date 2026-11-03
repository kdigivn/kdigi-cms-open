import type { CollectionConfig, Field } from 'payload'
import { formatLabels, toWords } from 'payload/shared'
import { adminDisplayDescription, adminDisplayLabel } from './admin-display-labels'

const FIELD_COMPONENTS = {
  text: '@/components/admin/premium-text-field#PremiumTextField',
  textarea: '@/components/admin/premium-textarea-field#PremiumTextareaField',
  select: '@/components/admin/premium-select-field#PremiumSelectField',
  checkbox: '@/components/admin/premium-checkbox-field#PremiumCheckboxField',
} as const

function applyFieldPresentation(fields: Field[]): Field[] {
  return fields.map((original) => {
    let field = { ...original }
    if ('name' in field || 'label' in field) {
      field.label = adminDisplayLabel(field.label, 'name' in field ? field.name : undefined)
    }
    if (field.admin && 'description' in field.admin) {
      field.admin = { ...field.admin, description: adminDisplayDescription(field.admin.description) }
    }
    if (field.type === 'select' || field.type === 'radio') {
      field = { ...field, options: field.options.map((option) => typeof option === 'string'
        ? { value: option, label: adminDisplayLabel(toWords(option)) }
        : { ...option, label: adminDisplayLabel(option.label) }) }
    }
    if (field.type === 'array') {
      const labels = { ...formatLabels(field.name), ...field.labels }
      field = { ...field, labels: {
        singular: adminDisplayLabel(labels.singular),
        plural: adminDisplayLabel(labels.plural),
      } }
    }
    if ('fields' in field) field = { ...field, fields: applyFieldPresentation(field.fields) }
    if (field.type === 'tabs') {
      field = { ...field, tabs: field.tabs.map((tab) => {
        const presented = { ...tab }
        presented.label = adminDisplayLabel(tab.label, 'name' in tab ? tab.name : undefined)
        presented.description = adminDisplayDescription(tab.description)
        presented.fields = applyFieldPresentation(tab.fields)
        return presented
      }) }
    }
    if (field.type === 'blocks') {
      field = { ...field, blocks: field.blocks.map((block) => {
        const labels = { ...formatLabels(block.slug), ...block.labels }
        return {
          ...block,
          labels: {
            singular: adminDisplayLabel(labels.singular),
            plural: adminDisplayLabel(labels.plural),
          },
          fields: applyFieldPresentation(block.fields),
        }
      }) }
    }
    if (field.admin?.components?.Field || (field.admin && 'hidden' in field.admin && field.admin.hidden)) return field
    if ((field.type === 'text' || field.type === 'select') && field.hasMany) return field
    switch (field.type) {
      case 'text':
        return { ...field, admin: { ...field.admin, components: { ...field.admin?.components, Field: FIELD_COMPONENTS.text } } }
      case 'textarea':
        return { ...field, admin: { ...field.admin, components: { ...field.admin?.components, Field: FIELD_COMPONENTS.textarea } } }
      case 'select':
        return { ...field, admin: { ...field.admin, components: { ...field.admin?.components, Field: FIELD_COMPONENTS.select } } }
      case 'checkbox':
        return { ...field, admin: { ...field.admin, components: { ...field.admin?.components, Field: FIELD_COMPONENTS.checkbox } } }
    }
    return field
  })
}

const NAV_GROUPS = [
  { slugs: ['posts', 'pages', 'products', 'landings', 'shortcodes'], label: { vi: 'Nội dung', en: 'Content' } },
  { slugs: ['media', 'taxonomies', 'faqs', 'authors', 'menus'], label: { vi: 'Thư viện & cấu trúc', en: 'Library & structure' } },
  { slugs: ['comments', 'redirects'], label: { vi: 'Vận hành', en: 'Operations' } },
  { slugs: ['sites', 'users', 'clone-run', 'tenant-adapt-review'], label: { vi: 'Quản trị', en: 'Administration' } },
]

// Presentation metadata only: no field names/types/access/hooks/storage changes.
// Existing specialized fields and the media list retain their behavior owners.
export function applyPremiumAdminPresentation(collections: CollectionConfig[]): CollectionConfig[] {
  return collections.map((collection) => {
    if (collection.slug === 'rating-events') return collection
    const components = collection.admin?.components
    return {
      ...collection,
      labels: collection.labels ? {
        singular: adminDisplayLabel(collection.labels.singular),
        plural: adminDisplayLabel(collection.labels.plural),
      } : undefined,
      fields: applyFieldPresentation(collection.fields),
      admin: {
        ...collection.admin,
        description: adminDisplayDescription(collection.admin?.description),
        group: NAV_GROUPS.find((group) => group.slugs.includes(collection.slug))?.label ?? collection.admin?.group,
        components: {
          ...components,
          views: {
            ...components?.views,
            ...(collection.slug === 'media' ? {} : { list: { ...components?.views?.list, Component: '@/components/admin/premium-collection-list-view#PremiumCollectionListView' } }),
            edit: {
              default: { Component: '@/components/admin/premium-edit-view#PremiumEditView' },
            },
          },
        },
      },
    }
  })
}
