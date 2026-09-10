import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import type { Profile } from '../../shared/domain'
import type { VideoAsset } from './types'

// The asset list is saved as lightweight metadata (AsyncStorage). Unlike the
// web app it stores no blobs: the source copies (DocumentPicker) and the
// finished outputs (clippress/) already live on disk in the app's sandbox, so
// restoring is just re-reading those file paths and checking they still exist.

const LIBRARY_KEY = 'clippress.library.v1'

export type PersistedAsset = {
  id: string
  name: string
  size: number
  uri: string
  profile: Profile
  status: VideoAsset['status']
  outputUri?: string
  outputSize?: number
  sourceDeleted?: boolean
}

export type PersistedLibrary = {
  globalProfile: Profile
  assets: PersistedAsset[]
}

export const saveLibrary = async (library: PersistedLibrary) => {
  try {
    await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  } catch {
    // persistence is best-effort
  }
}

const readLibrary = async (): Promise<PersistedLibrary | null> => {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_KEY)
    return raw ? (JSON.parse(raw) as PersistedLibrary) : null
  } catch {
    return null
  }
}

const fileExists = async (uri: string): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return Boolean(info.exists && !info.isDirectory && info.size > 0)
  } catch {
    return false
  }
}

// Rebuild the working list from what's on disk. A card survives if its source
// copy still exists, or if it's a completed card whose compressed output is
// still there (that's what keeps deleted-original cards shareable across
// restarts). `converting` cards interrupted by a shutdown reset to `ready`;
// completed cards whose output vanished (e.g. 'Clear stored files') do too.
export const hydrateLibrary = async (): Promise<{
  assets: VideoAsset[]
  globalProfile: Profile
  interrupted: number
}> => {
  const lib = await readLibrary()
  if (!lib) return { assets: [], globalProfile: { codec: 'h265', crf: 25 }, interrupted: 0 }
  const assets: VideoAsset[] = []
  let interrupted = 0
  for (const item of lib.assets) {
    const srcExists = await fileExists(item.uri)
    const outExists = item.outputUri ? await fileExists(item.outputUri) : false
    if (item.status === 'completed' && outExists) {
      // A completed card whose source is gone (deleted on purpose, or the OS
      // purged the cache copy) comes back in the deleted-original state: still
      // shareable, but with Re-convert hidden rather than a dead retry button.
      assets.push({
        ...item,
        status: 'completed',
        progress: 100,
        phase: undefined,
        error: undefined,
        sourceDeleted: item.sourceDeleted ?? !srcExists,
      })
      continue
    }
    if (!srcExists) continue
    if (item.status === 'converting') interrupted += 1
    assets.push({ ...item, status: 'ready', progress: 0, phase: undefined, error: undefined })
  }
  return { assets, globalProfile: lib.globalProfile, interrupted }
}