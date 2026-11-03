'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@payloadcms/ui'
import { CalendarDays } from 'lucide-react'

export const NavContentCalendarLink: React.FC = () => {
  const isActive = (usePathname() ?? '').includes('/admin/content-calendar')
  const { i18n } = useTranslation()

  return (
    <Link
      href="/admin/content-calendar"
      className={`nav__link${isActive ? ' active' : ''}`}
      data-nav-slug="content-calendar"
      aria-current={isActive ? 'page' : undefined}
    >
      <CalendarDays aria-hidden="true" size={17} />
      <span>{i18n.language === 'en' ? 'Editorial calendar' : 'Lịch nội dung'}</span>
    </Link>
  )
}
