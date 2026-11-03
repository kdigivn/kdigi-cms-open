'use client'

import React from 'react'
import { useListQuery, useTranslation } from '@payloadcms/ui'
import type { Where } from 'payload'

const STATUS_OPTIONS: Record<string, Array<{ value: string; vi: string; en: string }>> = {
  posts: [{ value: 'draft', vi: 'Bản nháp', en: 'Draft' }, { value: 'published', vi: 'Đã xuất bản', en: 'Published' }],
  pages: [{ value: 'draft', vi: 'Bản nháp', en: 'Draft' }, { value: 'published', vi: 'Đã xuất bản', en: 'Published' }],
  products: [{ value: 'draft', vi: 'Bản nháp', en: 'Draft' }, { value: 'published', vi: 'Đã xuất bản', en: 'Published' }],
  landings: [{ value: 'draft', vi: 'Bản nháp', en: 'Draft' }, { value: 'published', vi: 'Đã xuất bản', en: 'Published' }, { value: 'archived', vi: 'Lưu trữ', en: 'Archived' }],
  comments: [{ value: 'pending', vi: 'Chờ duyệt', en: 'Pending' }, { value: 'approved', vi: 'Đã duyệt', en: 'Approved' }, { value: 'spam', vi: 'Spam', en: 'Spam' }],
  'clone-run': [{ value: 'pending', vi: 'Chờ xử lý', en: 'Pending' }, { value: 'running', vi: 'Đang chạy', en: 'Running' }, { value: 'done', vi: 'Hoàn thành', en: 'Done' }, { value: 'failed', vi: 'Thất bại', en: 'Failed' }],
  'tenant-adapt-review': [{ value: 'pending', vi: 'Chờ duyệt', en: 'Pending' }, { value: 'accepted', vi: 'Đã chấp nhận', en: 'Accepted' }, { value: 'reverted', vi: 'Đã hoàn tác', en: 'Reverted' }],
}

// A tab owns only the top-level status condition it writes. Nested advanced
// conditions remain intact; replacing them would silently change user filters.
export function CollectionStatusFilters({ collectionSlug }: { collectionSlug: string }) {
  const { query, refineListData } = useListQuery()
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const options = STATUS_OPTIONS[collectionSlug]
  if (!options) return null
  const statusCondition = query.where?.status
  const selected = statusCondition && typeof statusCondition === 'object' && 'equals' in statusCondition
    ? String(statusCondition.equals)
    : ''

  const changeStatus = (value: string) => {
    const where: Where = { ...query.where }
    delete where.status
    if (value) where.status = { equals: value }
    void refineListData({ page: 1, where })
  }

  return (
    <div className="min-w-0 max-w-full mb-2">
      <div className="harbor-status-tabs" role="group" aria-label={isEnglish ? 'Status filter' : 'Lọc trạng thái'}>
        {[{ value: '', vi: 'Tất cả', en: 'All' }, ...options].map((option) => (
          <button
            key={option.value}
            type="button"
            className={`harbor-status-tabs__item${selected === option.value ? ' harbor-status-tabs__item--active' : ''}`}
            aria-pressed={selected === option.value}
            onClick={() => changeStatus(option.value)}
          >
            {option[isEnglish ? 'en' : 'vi']}
          </button>
        ))}
      </div>

    </div>
  )
}
