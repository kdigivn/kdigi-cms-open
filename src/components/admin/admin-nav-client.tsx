'use client'

import React, { useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowUpRight,
  BookOpenText,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  FileText,
  Folder,
  Globe2,
  LayoutDashboard,
  MessageSquareText,
  Settings2,
  Package,
  Moon,
  Sun,
  Tags,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavToggler, Popup, useNav, useTheme, useTranslation } from '@payloadcms/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Logo } from './logo'
import { Icon as BrandIcon } from './icon'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import { useBodyScrollLock } from './use-body-scroll-lock'

const COLLAPSE_KEY = 'kdigi_cms_sidebar_collapsed'
const COLLAPSE_EVENT = 'kdigi-cms:sidebar'
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(COLLAPSE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(COLLAPSE_EVENT, onChange)
  }
}
function getCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === 'true' } catch { return false }
}
export interface NavItemDTO {
  href: string
  label: string
  slug: string
}

export interface NavGroupDTO {
  label: string
  items: NavItemDTO[]
}

export interface TenantContextDTO {
  mode: 'selected' | 'all-sites' | 'none' | 'unavailable'
  label: string
  detail?: string
}

interface AdminNavClientProps {
  accountHref: string
  accountLabel?: string
  afterNav?: React.ReactNode
  afterNavLinks?: React.ReactNode
  beforeNav?: React.ReactNode
  beforeNavLinks?: React.ReactNode
  groups: NavGroupDTO[]
  logout: React.ReactNode
  settingsMenu: React.ReactNode[]
  tenantContext: TenantContextDTO
}

const ICON_BY_SLUG: Record<string, LucideIcon> = {
  authors: Users,
  comments: MessageSquareText,
  faqs: CircleHelp,
  landings: LayoutDashboard,
  menus: BookOpenText,
  pages: FileText,
  posts: FileText,
  products: Package,
  redirects: ArrowUpRight,
  sites: Globe2,
  shortcodes: BookOpenText,
  taxonomies: Tags,
  users: Users,
}

export const AdminNavClient: React.FC<AdminNavClientProps> = ({
  accountHref,
  accountLabel,
  afterNav,
  afterNavLinks,
  beforeNav,
  beforeNavLinks,
  groups,
  logout,
  settingsMenu,
  tenantContext,
}) => {
  const pathname = usePathname() ?? ''
  const { hydrated, navOpen, navRef, setNavOpen, shouldAnimate } = useNav()
  const { i18n, switchLanguage } = useTranslation()
  const { theme, setTheme } = useTheme()
  const isEnglish = i18n.language === 'en'
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({})
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const isCollapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false)
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLElement>(null)
  const mobileOpen = isMobile && navOpen
  const { handleKeyDown } = usePanelFocusTrap({ containerRef: panelRef, open: mobileOpen, onEscape: () => setNavOpen(false) })
  useBodyScrollLock(mobileOpen)

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(!isCollapsed))
      window.dispatchEvent(new Event(COLLAPSE_EVENT))
    } catch {
      // Storage can be disabled; native open/close navigation remains available.
    }
  }

  const classes = [
    'nav',
    'harbor-nav',
    isCollapsed && 'harbor-nav--collapsed',
    navOpen && 'nav--nav-open',
    hydrated && 'nav--nav-hydrated',
    shouldAnimate && 'nav--nav-animate',
  ].filter(Boolean).join(' ')

  const toggleGroup = (label: string) => {
    setClosedGroups((current) => ({ ...current, [label]: !current[label] }))
  }

  return (
    <TooltipProvider delayDuration={100}>
      {mobileOpen && <button type="button" className="kdigi-nav-backdrop" tabIndex={-1} aria-label={isEnglish ? 'Close navigation' : 'Đóng điều hướng'} onClick={() => setNavOpen(false)} />}
      <aside
        className={classes}
        ref={panelRef}
        inert={!navOpen || undefined}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label={isEnglish ? 'Main navigation' : 'Điều hướng chính'}
        onKeyDown={mobileOpen ? (event) => {
          if (!accountMenuOpen && panelRef.current?.contains(event.target as Node)) handleKeyDown(event)
        } : undefined}
        onClick={(event) => {
          if (isMobile && (event.target as HTMLElement).closest('a[href]')) setNavOpen(false)
        }}
      >
        <div className="nav__scroll harbor-nav__scroll" ref={navRef}>
          <div className="twp harbor-nav__inner">
            <div className="harbor-nav__brand">
              <Link href="/admin" className="harbor-nav__wordmark" aria-label="KDIGI CMS">
                <span className="harbor-nav__full-logo"><Logo /></span>
                <span className="harbor-nav__compact-logo"><BrandIcon /></span>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="harbor-nav__toggle harbor-nav__collapse-toggle"
                  onClick={toggleCollapsed}
                  aria-label={isCollapsed ? (isEnglish ? 'Expand sidebar' : 'Mở rộng menu') : (isEnglish ? 'Collapse sidebar' : 'Thu gọn menu')}
                  aria-pressed={isCollapsed}
                  title={isCollapsed ? (isEnglish ? 'Expand sidebar' : 'Mở rộng menu') : (isEnglish ? 'Collapse sidebar' : 'Thu gọn menu')}
                >
                  {isCollapsed ? <PanelLeftOpen aria-hidden="true" size={18} /> : <PanelLeftClose aria-hidden="true" size={18} />}
                </button>
                <NavToggler className="harbor-nav__toggle harbor-nav__mobile-toggle"><PanelLeftClose aria-hidden="true" size={18} /></NavToggler>
              </div>
            </div>

            <div className="harbor-nav__workspace">
              <button
                type="button"
                className="harbor-nav__workspace-trigger"
                onClick={toggleCollapsed}
                aria-label={`${isEnglish ? 'Select website' : 'Chọn website'}: ${tenantContext.label}`}
                title={tenantContext.label}
              >
                <Globe2 aria-hidden="true" size={16} />
              </button>
              <div className="harbor-nav__workspace-expanded">
                <div className="harbor-nav__workspace-heading">
                  <Globe2 aria-hidden="true" size={14} />
                  <span>{isEnglish ? 'Workspace' : 'Không gian làm việc'}</span>
                </div>
                <div className="harbor-nav__before-nav">{beforeNav}</div>
                <p className="harbor-nav__workspace-context" aria-live="polite">
                  {tenantContext.detail || tenantContext.label}
                </p>
              </div>
            </div>

            <nav className="nav__wrap harbor-nav__links" aria-label={isEnglish ? 'Navigation' : 'Điều hướng'}>
              {beforeNavLinks}
              <div className="harbor-nav__groups">
                {groups.map((group) => {
                  const isOpen = isCollapsed || closedGroups[group.label] !== true
                  return (
                    <section className="harbor-nav__group" key={group.label}>
                      <button
                        type="button"
                        className="harbor-nav__group-heading"
                        aria-expanded={isOpen}
                        tabIndex={isCollapsed && !isMobile ? -1 : undefined}
                        onClick={() => toggleGroup(group.label)}
                      >
                        <span>{group.label}</span>
                        <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      </button>
                      {isOpen && (
                        <ul className="harbor-nav__list">
                          {group.items.map((item) => {
                            const Icon = ICON_BY_SLUG[item.slug] ?? Folder
                            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                            return (
                              <li key={`${item.slug}-${item.href}`}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link
                                      href={item.href}
                                      aria-label={item.label}
                                      prefetch={false}
                                      className={`nav__link harbor-nav__item${isActive ? ' active' : ''}`}
                                      aria-current={isActive ? 'page' : undefined}
                                    >
                                      <Icon aria-hidden="true" className="size-[17px] shrink-0" />
                                      <span className="truncate harbor-nav__item-label">{item.label}</span>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" hidden={!isCollapsed || isMobile}>
                                    {item.label}
                                  </TooltipContent>
                                </Tooltip>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </section>
                  )
                })}
              </div>
              {afterNavLinks}
            </nav>

            {afterNav}

            <footer className="nav__controls harbor-nav__controls">
              <Popup
                className="harbor-nav__user-menu"
                onToggleOpen={() => setAccountMenuOpen(true)}
                onToggleClose={() => setAccountMenuOpen(false)}
                button={
                  <span className="harbor-nav__account" aria-label={isEnglish ? 'Account menu' : 'Menu tài khoản'}>
                    <Avatar className="size-8 shrink-0 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-muted text-xs font-medium text-foreground">
                        {(accountLabel?.trim().charAt(0) || 'F').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="harbor-nav__account-label">
                      <span className="block text-sm font-medium">{isEnglish ? 'My account' : 'Tài khoản'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{accountLabel}</span>
                    </span>
                    <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0" />
                  </span>
                }
                horizontalAlign="left"
                verticalAlign="top"
                size="large"
              >
                <div className="twp harbor-nav__user-actions">
                  <Link href={accountHref} className="harbor-nav__user-action">
                    <Settings2 aria-hidden="true" size={16} />
                    {isEnglish ? 'Account settings' : 'Cài đặt tài khoản'}
                  </Link>
                  {switchLanguage && (
                    <div className="harbor-nav__language">
                      <label htmlFor="harbor-interface-language">{isEnglish ? 'Interface language' : 'Ngôn ngữ giao diện'}</label>
                      <select
                        id="harbor-interface-language"
                        className="harbor-field__control"
                        value={i18n.language}
                        onChange={(event) => {
                          const language = event.currentTarget.value
                          if (language === 'vi' || language === 'en') void switchLanguage(language)
                        }}
                      >
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  )}
                  <button type="button" className="harbor-nav__user-action" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                    {theme === 'dark' ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
                    {theme === 'dark' ? (isEnglish ? 'Light theme' : 'Giao diện sáng') : (isEnglish ? 'Dark theme' : 'Giao diện tối')}
                  </button>
                  {settingsMenu.map((item, index) => <React.Fragment key={`settings-menu-item-${index}`}>{item}</React.Fragment>)}
                  <div className="harbor-nav__logout">{logout}<span aria-hidden="true">{isEnglish ? 'Log out' : 'Đăng xuất'}</span></div>
                </div>
              </Popup>
            </footer>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
