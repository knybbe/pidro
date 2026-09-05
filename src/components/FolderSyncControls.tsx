import { useEffect, useState } from 'react'
import {
  getFolderSyncState,
  getHistorySaveError,
  initFolderSync,
  isFolderSyncSupported,
  loadGameHistory,
  mapSyncFolder,
  requestSyncPermission,
  subscribeFolderSync,
  subscribeHistorySaveError,
  syncGameHistoryFromFolder,
  unmapSyncFolder,
  type FolderSyncState,
  type HistorySaveError,
} from '../engine/history'

interface Props {
  /** Called after a successful sync so parents can refresh lists */
  onHistoryChange?: () => void
  compact?: boolean
}

export function FolderSyncControls({ onHistoryChange, compact = false }: Props) {
  const [sync, setSync] = useState<FolderSyncState>(() => getFolderSyncState())
  const [saveError, setSaveError] = useState<HistorySaveError | null>(() =>
    getHistorySaveError(),
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsubSync = subscribeFolderSync(setSync)
    const unsubErr = subscribeHistorySaveError(setSaveError)
    void initFolderSync().then(setSync)
    return () => {
      unsubSync()
      unsubErr()
    }
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onHistoryChange?.()
    } finally {
      setBusy(false)
      setSync(getFolderSyncState())
    }
  }

  const statusLabel = (() => {
    switch (sync.status) {
      case 'unsupported':
        return 'Folder sync unavailable in this browser — history stays in local storage.'
      case 'unmapped':
        return 'No sync folder mapped. Map a folder inside OneDrive / Google Drive / Dropbox to keep matches in sync across machines.'
      case 'permission_needed':
        return `Permission needed for folder “${sync.folderName ?? 'mapped'}”.`
      case 'syncing':
        return 'Syncing…'
      case 'error':
        return sync.lastError ?? 'Sync error'
      case 'mapped':
        return sync.lastSyncedAt
          ? `Synced with “${sync.folderName}” · ${formatShort(sync.lastSyncedAt)}`
          : `Mapped to “${sync.folderName}”`
      default:
        return ''
    }
  })()

  if (compact && sync.status === 'unsupported') {
    return null
  }

  return (
    <div className={`folder-sync ${compact ? 'folder-sync-compact' : ''}`}>
      {!compact && <h3 className="folder-sync-title">Multi-machine sync</h3>}
      <p className="hint folder-sync-status" role="status">
        {statusLabel}
      </p>
      {saveError && (
        <p className="folder-sync-error" role="alert">
          ⚠ {saveError.message}
        </p>
      )}
      <div className="folder-sync-actions">
        {sync.status === 'unmapped' && sync.supported && (
          <button
            type="button"
            className="btn secondary btn-sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await mapSyncFolder()
                await syncGameHistoryFromFolder()
                // Touch load so callers see merged data
                loadGameHistory()
              })
            }
          >
            📁 Map sync folder
          </button>
        )}
        {sync.status === 'permission_needed' && (
          <button
            type="button"
            className="btn primary btn-sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const ok = await requestSyncPermission()
                if (ok) await syncGameHistoryFromFolder()
              })
            }
          >
            Grant folder access
          </button>
        )}
        {(sync.status === 'mapped' || sync.status === 'error') && (
          <>
            <button
              type="button"
              className="btn secondary btn-sm"
              disabled={busy}
              onClick={() => run(() => syncGameHistoryFromFolder())}
            >
              ↻ Sync now
            </button>
            <button
              type="button"
              className="btn ghost btn-sm"
              disabled={busy}
              onClick={() => run(() => unmapSyncFolder())}
            >
              Unmap folder
            </button>
          </>
        )}
        {!isFolderSyncSupported() && !compact && (
          <span className="hint">Uses this device’s localStorage only.</span>
        )}
      </div>
    </div>
  )
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
