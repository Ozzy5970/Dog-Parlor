import { useEffect, useRef } from 'react'

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

export default function Turnstile({ sitekey, onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    // Check if script is already in the document
    const SCRIPT_ID = 'cloudflare-turnstile-script'
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    const initializeTurnstile = () => {
      if (!active || !containerRef.current || !window.turnstile) return

      try {
        // Clean up any old widget
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
        }

        // Render Turnstile
        const id = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: (token) => {
            if (active) onVerify(token)
          },
          'expired-callback': () => {
            if (active && onExpire) onExpire()
          },
          'error-callback': () => {
            if (active && onError) onError()
          },
        })
        widgetIdRef.current = id
      } catch (err) {
        console.error('Error rendering Turnstile:', err)
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.body.appendChild(script)

      script.onload = () => {
        initializeTurnstile()
      }
    } else {
      // Script is already loaded/loading
      if (window.turnstile) {
        initializeTurnstile()
      } else {
        // Wait for it to load
        script.addEventListener('load', initializeTurnstile)
      }
    }

    return () => {
      active = false
      if (script) {
        script.removeEventListener('load', initializeTurnstile)
      }
      // Safely remove widget on unmount
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch (e) {
          // ignore
        }
      }
    }
  }, [sitekey, onVerify, onExpire, onError])

  return <div ref={containerRef} className="flex justify-center py-2" />
}
