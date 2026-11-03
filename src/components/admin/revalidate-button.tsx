'use client'
/**
 * Client-side button that calls the KDIGI CMS /api/revalidate-frontend proxy endpoint.
 * Shows loading → success / error feedback inline, resets after 4 seconds.
 *
 * Passes the active `tenantId` (resolved server-side from the payload-tenant cookie)
 * so the endpoint can resolve the tenant's frontend domain instead of falling back
 * to the dev-only http://localhost:3002 URL in production.
 */
import React, { useCallback, useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { RotateCw, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type State = 'idle' | 'loading' | 'ok' | 'error'

export const RevalidateButton: React.FC<{ tenantId?: string }> = ({ tenantId }) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')

  const handleClick = useCallback(async () => {
    setState('loading')
    setMsg('')
    try {
      const res = await fetch('/api/revalidate-frontend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setState('ok')
        setMsg(isEnglish ? 'Cache cleared!' : 'Đã làm mới bộ nhớ đệm!')
      } else {
        setState('error')
        setMsg(json.error ?? `${isEnglish ? 'Error' : 'Lỗi'} ${res.status}`)
      }
    } catch (e) {
      setState('error')
      setMsg(String(e))
    } finally {
      setTimeout(() => setState('idle'), 4000)
    }
  }, [tenantId, isEnglish])

  const variant = state === 'ok' ? 'success' : state === 'error' ? 'destructive' : 'outline'

  const content: Record<State, React.ReactNode> = {
    idle: (
      <>
        <RotateCw /> {isEnglish ? 'Refresh cache' : 'Làm mới bộ nhớ đệm'}
      </>
    ),
    loading: (
      <>
        <Loader2 className="animate-spin" /> {isEnglish ? 'Working…' : 'Đang xử lý…'}
      </>
    ),
    ok: (
      <>
        <Check /> {msg || (isEnglish ? 'Done' : 'Hoàn tất')}
      </>
    ),
    error: (
      <>
        <X /> {msg || (isEnglish ? 'Error' : 'Lỗi')}
      </>
    ),
  }

  return (
    <span className="twp inline-flex">
      <Button variant={variant} onClick={handleClick} disabled={state === 'loading'}>
        {content[state]}
      </Button>
    </span>
  )
}
