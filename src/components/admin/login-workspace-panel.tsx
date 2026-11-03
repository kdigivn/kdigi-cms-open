import React from 'react'
import type { ServerProps } from 'payload'
import { Icon } from './icon'

export const LoginWorkspacePanel: React.FC<ServerProps> = ({ i18n }) => {
  const isEnglish = i18n.language === 'en'

  return (
    <div className="harbor-login__panel">
      <div className="harbor-login__brand"><Icon /><span>KDIGI CMS</span></div>
      <p className="harbor-login__tagline">
        {isEnglish ? 'Open-source multi-site content management' : 'Hệ quản trị nội dung đa site mã nguồn mở'}
      </p>
      <div className="harbor-login__intro">
        <h1>{isEnglish ? 'Login' : 'Đăng nhập'}</h1>
        <p>{isEnglish ? 'Enter your email and password to access your workspace.' : 'Nhập email và mật khẩu để vào không gian quản trị.'}</p>
      </div>
    </div>
  )
}
