import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'

export type VersionStatus = 'idle' | 'checking' | 'up_to_date' | 'out_of_date'

export function useVersionCheck() {
  const [status, setStatus] = useState<VersionStatus>('idle')
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null)

  useEffect(() => {
    // Only check if network is available
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return
    }

    let isMounted = true
    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const checkVersion = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return
      }

      setStatus('checking')

      try {
        const baseUrl = import.meta.env.BASE_URL || '/'
        const versionUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}version.txt?_t=${Date.now()}`
        
        const res = await fetch(versionUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        })

        if (!res.ok) {
          if (isMounted) setStatus('idle')
          return
        }

        const text = (await res.text()).trim()
        if (!text) {
          if (isMounted) setStatus('idle')
          return
        }

        const cleanRemote = text.replace(/^v/i, '')
        const cleanCurrent = APP_VERSION.replace(/^v/i, '')

        if (!isMounted) return

        setRemoteVersion(text)

        if (cleanRemote && cleanRemote !== cleanCurrent) {
          // Out of date: show red indicator and reload the page
          setStatus('out_of_date')
          console.warn(`[Pidro] App out of date (current: ${APP_VERSION}, latest: ${text}). Reloading...`)

          reloadTimer = setTimeout(async () => {
            try {
              if ('caches' in window) {
                const cacheNames = await window.caches.keys()
                await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
              }
              if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations()
                for (const reg of registrations) {
                  await reg.unregister()
                }
              }
            } catch (e) {
              console.error('Error clearing cache on auto-update:', e)
            }
            const reloadUrl = new URL(window.location.href)
            reloadUrl.searchParams.set('v_reload', String(Date.now()))
            window.location.replace(reloadUrl.toString())
          }, 1200)
        } else {
          // Up to date: show green indicator for 4 seconds then return to subtle state
          setStatus('up_to_date')
          setTimeout(() => {
            if (isMounted) setStatus('idle')
          }, 4000)
        }
      } catch (err) {
        // Offline or network error: fail silently and stay idle
        if (isMounted) setStatus('idle')
      }
    }

    // Run check on startup after short micro-delay
    const initTimer = setTimeout(() => {
      checkVersion()
    }, 400)

    const handleOnline = () => {
      checkVersion()
    }

    window.addEventListener('online', handleOnline)

    return () => {
      isMounted = false
      clearTimeout(initTimer)
      if (reloadTimer) clearTimeout(reloadTimer)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return { status, remoteVersion }
}
