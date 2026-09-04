export { mergeByUpdatedAt, compareUpdatedAt } from './merge'
export {
  compactGameState,
  compactHistoryRecord,
  compactHistoryList,
  aggressivelyCompactHistory,
} from './compact'
export {
  GAME_HISTORY_KEY,
  readLocalHistory,
  writeLocalHistory,
  clearLocalHistory,
  getHistorySaveError,
  subscribeHistorySaveError,
  clearHistorySaveError,
} from './localStore'
export {
  isFolderSyncSupported,
  getFolderSyncState,
  subscribeFolderSync,
  initFolderSync,
  mapSyncFolder,
  unmapSyncFolder,
  requestSyncPermission,
  syncHistoryWithFolder,
  writePrefsToFolder,
  writeCurrentGameToFolder,
  readCurrentGameFromFolder,
} from './folderSync'
export type {
  HistoryFileDocument,
  PrefsFileDocument,
  CurrentGameFileDocument,
  HistorySaveError,
  SyncStatus,
  FolderSyncState,
} from './types'
