/**
 * Server component that injects the admin theme CSS into the Payload admin.
 * Registered as admin.components.providers in payload.config.ts.
 * Next.js App Router allows global CSS imports from any server component
 * rendered within the app/ tree.
 */
import React from 'react'
import '@/app/(payload)/custom.css'
import '@fontsource-variable/inter'

export const CSSInjector: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return <>{children}</>
}
