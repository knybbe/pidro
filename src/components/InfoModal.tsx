import { useState } from 'react'
import { APP_COPYRIGHT, APP_VERSION } from '../version'

interface Props {
  open: boolean
  onClose: () => void
}

export function InfoModal({ open, onClose }: Props) {
  const [updating, setUpdating] = useState(false)

  if (!open) return null

  const handleForceUpdate = async () => {
    setUpdating(true)
    try {
      // 1. Delete all CacheStorage caches
      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
      }
      // 2. Unregister all service worker registrations
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
      }
    } catch (e) {
      console.error('Failed to clear caches/service workers:', e)
    }

    // 3. Force reload with cache-busting timestamp
    const url = new URL(window.location.href)
    url.searchParams.set('reload', String(Date.now()))
    window.location.replace(url.toString())
  }

  const logoSrc = `${import.meta.env.BASE_URL}logo.jpg`

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal info-modal"
        role="dialog"
        aria-labelledby="info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="info-title">About Pidro</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="modal-body info-modal-body">
          <div className="info-top">
            <img
              src={logoSrc}
              alt="Pidro 5 of Hearts"
              className="info-logo-img"
              onError={(e) => {
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
            <div className="info-title-group">
              <h3 className="info-app-title">Pidro</h3>
              <p className="info-app-sub">Finnish Partnership Card Game</p>
              <span className="info-version-pill">{APP_VERSION}</span>
            </div>
          </div>

          <div className="info-card">
            <p>
              <strong>Pidro</strong> is a traditional 4-player Finnish partnership
              trick-taking card game (you & North vs West & East). Bid, name trumps,
              take the 14 point cards, and race to 62 points.
            </p>
          </div>

          <div className="info-card">
            <h4>🤖 AI Development</h4>
            <p>
              This game was fully AI-coded with <strong>Grok</strong> and{' '}
              <strong>Antigravity</strong>.
            </p>
          </div>

          <div className="info-card">
            <h4>📄 Open Source & License</h4>
            <p>
              Released under the <strong>MIT License</strong>.
            </p>
            <p className="info-copyright">{APP_COPYRIGHT}</p>
          </div>

          <div className="info-card info-support-card">
            <h4>☕ Support & Donations</h4>
            <p className="info-recipient">
              Recipient: <code>kny@iki.fi</code>
            </p>
            <div className="paypal-button-group" role="group" aria-label="PayPal donation options">
              <a
                href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=kny%40iki.fi&currency_code=EUR&amount=1&item_name=Pidro+Card+Game"
                target="_blank"
                rel="noopener noreferrer"
                className="paypal-pill"
              >
                1 €
              </a>
              <a
                href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=kny%40iki.fi&currency_code=EUR&amount=4.20&item_name=Pidro+Card+Game"
                target="_blank"
                rel="noopener noreferrer"
                className="paypal-pill"
              >
                4.2 €
              </a>
              <a
                href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=kny%40iki.fi&currency_code=EUR&item_name=Pidro+Card+Game"
                target="_blank"
                rel="noopener noreferrer"
                className="paypal-pill"
              >
                Other
              </a>
            </div>
          </div>

          <div className="info-card info-update-card">
            <h4>🔄 App Updates</h4>
            <p className="hint">
              If a newly published version does not appear due to browser/PWA caching:
            </p>
            <button
              type="button"
              className="btn secondary force-update-btn"
              onClick={handleForceUpdate}
              disabled={updating}
            >
              {updating ? 'Clearing cache & reloading…' : 'Check for new version & force reload'}
            </button>
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
