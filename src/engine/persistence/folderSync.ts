/**
 * Optional multi-machine sync via File System Access API.
 * Maps a local folder (often inside OneDrive / Google Drive / Dropbox / iCloud),
 * persists the directory handle in IndexedDB, and reads/writes:
 *   <folder>/pidro/history.json
 *   <folder>/pidro/prefs.json
 *   <folder>/pidro/current-game.json
 *
 * Unsupported browsers (notably iOS Safari) keep localStorage only.
 */

import { mergeByUpdatedAt } from './merge'
import type {
  CurrentGameFileDocument,
  FolderSyncState,
  HistoryFileDocument,
  PrefsFileDocument,
  SyncStatus,
} from './types'
import type { GameHistoryRecord } from '../history'

const IDB_NAME = 'pidro-folder-sync'
const IDB_STORE = 'handles'
const IDB_KEY = 'syncDirectory'
const PIDRO_DIR = 'pidro'
const HISTORY_FILE = 'history.json'
const PREFS_FILE = 'prefs.json'
const CURRENT_GAME_FILE = 'current-game.json'

const MAX_FOLDER_GAMES = 100

type DirectoryHandle = FileSystemDirectoryHandle

let cachedHandle: DirectoryHandle | null = null
let state: FolderSyncState = {
  status: isFolderSyncSupported() ? 'unmapped' : 'unsupported',
  folderName: null,
  lastSyncedAt: null,
  lastError: null,
  supported: isFolderSyncSupported(),
}

const listeners = new Set<(s: FolderSyncState) => void>()

export function isFolderSyncSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown })
      .showDirectoryPicker === 'function' &&
    typeof indexedDB !== 'undefined'
  )
}

export function getFolderSyncState(): FolderSyncState {
  return { ...state }
}

export function subscribeFolderSync(
  listener: (s: FolderSyncState) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setState(partial: Partial<FolderSyncState>): void {
  state = { ...state, ...partial, supported: isFolderSyncSupported() }
  for (const l of listeners) {
    try {
      l(getFolderSyncState())
    } catch {
      /* ignore */
    }
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
  })
}

async function idbGetHandle(): Promise<DirectoryHandle | null> {
  try {
    const db = await openIdb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const req = store.get(IDB_KEY)
      req.onsuccess = () => resolve((req.result as DirectoryHandle) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSetHandle(handle: DirectoryHandle | null): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = handle ? store.put(handle, IDB_KEY) : store.delete(IDB_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function ensurePermission(
  handle: DirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const withPerm = handle as DirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<PermissionState>
    requestPermission?: (o: { mode: string }) => Promise<PermissionState>
  }
  if (typeof withPerm.queryPermission === 'function') {
    let perm = await withPerm.queryPermission({ mode })
    if (perm === 'granted') return true
    if (typeof withPerm.requestPermission === 'function') {
      perm = await withPerm.requestPermission({ mode })
      return perm === 'granted'
    }
    return false
  }
  // Older / polyfilled environments — assume granted if we have a handle
  return true
}

async function getPidroDir(
  root: DirectoryHandle,
  create: boolean,
): Promise<DirectoryHandle> {
  return root.getDirectoryHandle(PIDRO_DIR, { create })
}

async function readJsonFile<T>(
  dir: DirectoryHandle,
  name: string,
): Promise<T | null> {
  try {
    const fh = await dir.getFileHandle(name)
    const file = await fh.getFile()
    const text = await file.text()
    if (!text.trim()) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJsonFile(
  dir: DirectoryHandle,
  name: string,
  data: unknown,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

/** Restore handle from IndexedDB and update status (call on startup). */
export async function initFolderSync(): Promise<FolderSyncState> {
  if (!isFolderSyncSupported()) {
    setState({
      status: 'unsupported',
      folderName: null,
      lastError: null,
    })
    return getFolderSyncState()
  }

  const handle = await idbGetHandle()
  if (!handle) {
    cachedHandle = null
    setState({ status: 'unmapped', folderName: null, lastError: null })
    return getFolderSyncState()
  }

  cachedHandle = handle
  const ok = await ensurePermission(handle, 'readwrite')
  if (!ok) {
    setState({
      status: 'permission_needed',
      folderName: handle.name,
      lastError: 'Permission needed to access the sync folder.',
    })
    return getFolderSyncState()
  }

  setState({
    status: 'mapped',
    folderName: handle.name,
    lastError: null,
  })
  return getFolderSyncState()
}

/** Prompt the user to pick a sync folder and store the handle. */
export async function mapSyncFolder(): Promise<FolderSyncState> {
  if (!isFolderSyncSupported()) {
    setState({
      status: 'unsupported',
      lastError:
        'Folder sync is not supported in this browser (use Chrome/Edge/Desktop Safari, or keep localStorage).',
    })
    return getFolderSyncState()
  }

  try {
    const picker = (
      window as unknown as {
        showDirectoryPicker: (opts?: {
          id?: string
          mode?: string
        }) => Promise<DirectoryHandle>
      }
    ).showDirectoryPicker
    const handle = await picker({ id: 'pidro-sync', mode: 'readwrite' })
    await idbSetHandle(handle)
    cachedHandle = handle
    setState({
      status: 'mapped',
      folderName: handle.name,
      lastError: null,
    })
  } catch (e) {
    const aborted =
      e instanceof DOMException &&
      (e.name === 'AbortError' || e.name === 'NotAllowedError')
    if (!aborted) {
      setState({
        lastError: e instanceof Error ? e.message : String(e),
        status: state.status === 'unsupported' ? 'unsupported' : state.status,
      })
    }
  }
  return getFolderSyncState()
}

export async function unmapSyncFolder(): Promise<FolderSyncState> {
  cachedHandle = null
  try {
    await idbSetHandle(null)
  } catch {
    /* ignore */
  }
  setState({
    status: isFolderSyncSupported() ? 'unmapped' : 'unsupported',
    folderName: null,
    lastSyncedAt: null,
    lastError: null,
  })
  return getFolderSyncState()
}

export async function requestSyncPermission(): Promise<boolean> {
  const handle = cachedHandle ?? (await idbGetHandle())
  if (!handle) return false
  cachedHandle = handle
  const ok = await ensurePermission(handle, 'readwrite')
  if (ok) {
    setState({
      status: 'mapped',
      folderName: handle.name,
      lastError: null,
    })
  } else {
    setState({
      status: 'permission_needed',
      folderName: handle.name,
      lastError: 'Permission needed to access the sync folder.',
    })
  }
  return ok
}

function parseHistoryDoc(raw: HistoryFileDocument | null): GameHistoryRecord[] {
  if (!raw || !Array.isArray(raw.games)) return []
  return raw.games.filter(
    (g) =>
      g &&
      typeof (g as GameHistoryRecord).id === 'string' &&
      Array.isArray((g as GameHistoryRecord).rounds),
  ) as GameHistoryRecord[]
}

/**
 * Read folder history (if mapped + permitted), merge with local by updatedAt,
 * write merged result back to both local (caller) and folder.
 */
export async function syncHistoryWithFolder(
  localHistory: GameHistoryRecord[],
): Promise<{
  history: GameHistoryRecord[]
  synced: boolean
  status: SyncStatus
}> {
  if (!isFolderSyncSupported()) {
    return { history: localHistory, synced: false, status: 'unsupported' }
  }

  let handle = cachedHandle
  if (!handle) {
    handle = await idbGetHandle()
    cachedHandle = handle
  }
  if (!handle) {
    setState({ status: 'unmapped', folderName: null })
    return { history: localHistory, synced: false, status: 'unmapped' }
  }

  const permitted = await ensurePermission(handle, 'readwrite')
  if (!permitted) {
    setState({
      status: 'permission_needed',
      folderName: handle.name,
      lastError: 'Permission needed to access the sync folder.',
    })
    return { history: localHistory, synced: false, status: 'permission_needed' }
  }

  setState({ status: 'syncing', folderName: handle.name, lastError: null })

  try {
    const pidroDir = await getPidroDir(handle, true)
    const doc = await readJsonFile<HistoryFileDocument>(pidroDir, HISTORY_FILE)
    const remote = parseHistoryDoc(doc)
    const merged = mergeByUpdatedAt(localHistory, remote, MAX_FOLDER_GAMES)
    const now = new Date().toISOString()
    const out: HistoryFileDocument = {
      version: 1,
      updatedAt: now,
      games: merged,
    }
    await writeJsonFile(pidroDir, HISTORY_FILE, out)
    setState({
      status: 'mapped',
      folderName: handle.name,
      lastSyncedAt: now,
      lastError: null,
    })
    return { history: merged, synced: true, status: 'mapped' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    setState({
      status: 'error',
      folderName: handle.name,
      lastError: message,
    })
    return { history: localHistory, synced: false, status: 'error' }
  }
}

/** Write prefs into the mapped folder (best-effort). */
export async function writePrefsToFolder(
  prefs: Omit<PrefsFileDocument, 'version' | 'updatedAt'>,
): Promise<void> {
  const handle = cachedHandle
  if (!handle || state.status !== 'mapped') return
  try {
    const pidroDir = await getPidroDir(handle, true)
    const doc: PrefsFileDocument = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...prefs,
    }
    await writeJsonFile(pidroDir, PREFS_FILE, doc)
  } catch {
    /* best-effort */
  }
}

/** Write current game snapshot into the mapped folder (best-effort). */
export async function writeCurrentGameToFolder(
  gameId: string | null,
  gameState: unknown | null,
): Promise<void> {
  const handle = cachedHandle
  if (!handle || state.status !== 'mapped') return
  try {
    const pidroDir = await getPidroDir(handle, true)
    const doc: CurrentGameFileDocument = {
      version: 1,
      updatedAt: new Date().toISOString(),
      gameId,
      state: gameState,
    }
    await writeJsonFile(pidroDir, CURRENT_GAME_FILE, doc)
  } catch {
    /* best-effort */
  }
}

export async function readCurrentGameFromFolder(): Promise<CurrentGameFileDocument | null> {
  const handle = cachedHandle
  if (!handle) return null
  const permitted = await ensurePermission(handle, 'read')
  if (!permitted) return null
  try {
    const pidroDir = await getPidroDir(handle, false)
    return await readJsonFile<CurrentGameFileDocument>(pidroDir, CURRENT_GAME_FILE)
  } catch {
    return null
  }
}
