import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface TurnstileProps {
  sitekey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

declare global {
  interface Window {
    onloadTurnstileCallback?: () => void
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        }
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

// Singleton script loader tracking
let scriptStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
const scriptCallbacks = new Set<(status: 'loaded' | 'error') => void>()

function loadTurnstileScript(callback: (status: 'loaded' | 'error') => void) {
  if (scriptStatus === 'loaded') {
    callback('loaded')
    return () => {}
  }
  if (scriptStatus === 'error') {
    callback('error')
    return () => {}
  }

  scriptCallbacks.add(callback)

  if (scriptStatus === 'idle') {
    scriptStatus = 'loading'
    const SCRIPT_ID = 'cloudflare-turnstile-script'
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    const handleLoad = () => {
      scriptStatus = 'loaded'
      scriptCallbacks.forEach((cb) => cb('loaded'))
      scriptCallbacks.clear()
    }

    const handleError = () => {
      scriptStatus = 'error'
      scriptCallbacks.forEach((cb) => cb('error'))
      scriptCallbacks.clear()
    }

    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }

    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)

    return () => {
      if (script) {
        script.removeEventListener('load', handleLoad)
        script.removeEventListener('error', handleError)
      }
    }
  }

  return () => {
    scriptCallbacks.delete(callback)
  }
}

export default function Turnstile({ sitekey, onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const renderedRef = useRef<boolean>(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const onErrorRef = useRef(onError)

  // Keep callback refs fresh
  useEffect(() => {
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError
  })

  const isProduction = import.meta.env.PROD
  const isConfigError = isProduction && (!import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITE_KEY === '1x00000000000000000000AA')

  useEffect(() => {
    if (isConfigError) {
      setStatus('error')
      return
    }

    let active = true

    const initializeTurnstile = () => {
      if (!active || !containerRef.current || !window.turnstile || renderedRef.current) return

      try {
        renderedRef.current = true
        const id = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: (token) => {
            if (active) onVerifyRef.current(token)
          },
          'expired-callback': () => {
            if (active) {
              if (onExpireRef.current) onExpireRef.current()
            }
          },
          'error-callback': () => {
            if (active) {
              if (onErrorRef.current) onErrorRef.current()
            }
          },
        })
        widgetIdRef.current = id
        setStatus('ready')
      } catch (err) {
        console.error('Error rendering Turnstile:', err)
        setStatus('error')
      }
    }

    const cleanUpScriptListener = loadTurnstileScript((loadResult) => {
      if (!active) return
      if (loadResult === 'loaded') {
        if (window.turnstile) {
          initializeTurnstile()
        } else {
          // Fallback if window.turnstile isn't immediately attached
          const interval = setInterval(() => {
            if (window.turnstile) {
              clearInterval(interval)
              initializeTurnstile()
            }
          }, 50)
          setTimeout(() => clearInterval(interval), 2000)
        }
      } else {
        setStatus('error')
      }
    })

    return () => {
      active = false
      cleanUpScriptListener()
      
      // Safely remove widget on unmount
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
          renderedRef.current = false
        } catch (e) {
          // ignore
        }
      }
    }
  }, [sitekey, isConfigError])

  if (isConfigError) {
    return (
      <div className="flex flex-col items-center justify-center py-4">
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold text-center max-w-sm">
          Verification is not configured. Please contact the parlour.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-4 min-h-[80px]">
      {status === 'loading' && (
        <p className="text-slate-400 font-bold text-xs flex items-center gap-1.5 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading human verification...
        </p>
      )}
      {status === 'error' && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold text-center max-w-sm">
          Human verification could not load. Please refresh or check that browser extensions are not blocking Cloudflare.
        </div>
      )}
      <div
        ref={containerRef}
        className={status === 'ready' ? 'py-1' : 'hidden'}
        style={{ minHeight: status === 'ready' ? '65px' : '0px' }}
      />
    </div>
  )
}
