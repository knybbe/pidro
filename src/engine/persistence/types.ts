/** On-disk / synced folder document for match history. */
export interface HistoryFileDocument {
  version: 1
  updatedAt: string
  /** GameHistoryRecord[] — typed at call sites to avoid circular imports */
  games: unknown[]
}

/** Optional synced prefs written beside history. */
export interface PrefsFileDocument {
  version: 1
  updatedAt: string
  gameMode?: string
  bidDelaySec?: number
  botConfigs?: unknown
}

/** Optional current in-progress match pointer for multi-machine resume. */
export interface CurrentGameFileDocument {
  version: 1
  updatedAt: string
  gameId: string | null
  state: unknown | null
}

export type HistorySaveError = {
  message: string
  quotaExceeded: boolean
}

export type SyncStatus =
  | 'unsupported'
  | 'unmapped'
  | 'mapped'
  | 'permission_needed'
  | 'syncing'
  | 'error'

export interface FolderSyncState {
  status: SyncStatus
  folderName: string | null
  lastSyncedAt: string | null
  lastError: string | null
  supported: boolean
}
