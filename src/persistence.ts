import type { Codec, Crf } from '../shared/domain'

export type PersistedProfile = { codec: Codec; crf: Crf }
export type PersistedVideo = {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  profile: PersistedProfile
  status: 'ready' | 'queued' | 'converting' | 'completed' | 'failed' | 'cancelled'
  outputName?: string
  outputSize?: number
}
export type PersistedWorkspace = {
  globalProfile: PersistedProfile
  videos: PersistedVideo[]
}

const DB_NAME = 'clippress'
const DB_VERSION = 1
const FILES_STORE = 'files'
const OUTPUTS_STORE = 'outputs'
const META_STORE = 'meta'
const META_KEY = 'workspace'

const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB unavailable'))
    return
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE)
    if (!db.objectStoreNames.contains(OUTPUTS_STORE)) db.createObjectStore(OUTPUTS_STORE)
    if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const requestToResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export const saveWorkspaceMeta = async (workspace: PersistedWorkspace) => {
  const db = await openDB().catch(() => undefined)
  if (!db || !db.objectStoreNames.contains(META_STORE)) return
  try {
    await requestToResult(db.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put(workspace, META_KEY))
  } catch { /* best-effort persistence */ }
}

export const saveSourceFile = async (id: string, blob: Blob) => {
  const db = await openDB().catch(() => undefined)
  if (!db) return
  try {
    await requestToResult(db.transaction(FILES_STORE, 'readwrite').objectStore(FILES_STORE).put(blob, id))
  } catch { /* best-effort persistence */ }
}

export const saveOutputFile = async (id: string, blob: Blob) => {
  const db = await openDB().catch(() => undefined)
  if (!db) return
  try {
    await requestToResult(db.transaction(OUTPUTS_STORE, 'readwrite').objectStore(OUTPUTS_STORE).put(blob, id))
  } catch { /* best-effort persistence */ }
}

export const getSourceFile = async (id: string): Promise<Blob | undefined> => {
  const db = await openDB().catch(() => undefined)
  if (!db) return undefined
  try {
    return await requestToResult<Blob | undefined>(db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get(id))
  } catch { return undefined }
}

export const getOutputFile = async (id: string): Promise<Blob | undefined> => {
  const db = await openDB().catch(() => undefined)
  if (!db) return undefined
  try {
    return await requestToResult<Blob | undefined>(db.transaction(OUTPUTS_STORE, 'readonly').objectStore(OUTPUTS_STORE).get(id))
  } catch { return undefined }
}

export const getWorkspaceMeta = async (): Promise<PersistedWorkspace | undefined> => {
  const db = await openDB().catch(() => undefined)
  if (!db || !db.objectStoreNames.contains(META_STORE)) return undefined
  try {
    return await requestToResult<PersistedWorkspace | undefined>(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(META_KEY))
  } catch { return undefined }
}