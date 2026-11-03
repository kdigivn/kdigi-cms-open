'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@payloadcms/ui'
import { LayoutDashboard } from 'lucide-react'

export const NavHomeLink: React.FC = () => {
  const pathname = usePathname() ?? ''
  const isActive = pathname === '/admin' || pathname === '/admin/'
  const { i18n } = useTranslation()
  const label = i18n.language === 'en' ? 'Dashboard' : 'Tổng quan'

  return (
    <Link href="/admin" className={`nav__link${isActive ? ' active' : ''}`} data-nav-slug="__home" aria-current={isActive ? 'page' : undefined}>
      <LayoutDashboard aria-hidden="true" size={17} />
      <span>{label}</span>
    </Link>
  )
}
