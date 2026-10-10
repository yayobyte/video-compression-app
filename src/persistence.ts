import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { DEFAULT_PROFILE } from './domain'
import type { Profile, Quality } from './domain'
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

// Libraries saved before on-device-only stored a codec/CRF profile. Map those
// onto the closest quality (CRF 25 → high, 28 → balanced) at original size.
type LegacyProfile = { codec?: string; crf?: number }

const normalizeProfile = (profile: Partial<Profile> & LegacyProfile | undefined): Profile => {
  if (profile?.quality && profile.maxResolution) return { quality: profile.quality, maxResolution: profile.maxResolution }
  const quality: Quality = profile?.crf === 25 ? 'high' : DEFAULT_PROFILE.quality
  return { ...DEFAULT_PROFILE, quality }
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
  if (!lib) return { assets: [], globalProfile: DEFAULT_PROFILE, interrupted: 0 }
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
        profile: normalizeProfile(item.profile),
        status: 'completed',
        progress: 100,
        error: undefined,
        sourceDeleted: item.sourceDeleted ?? !srcExists,
      })
      continue
    }
    if (!srcExists) continue
    if (item.status === 'converting') interrupted += 1
    assets.push({ ...item, profile: normalizeProfile(item.profile), status: 'ready', progress: 0, error: undefined })
  }
  return { assets, globalProfile: normalizeProfile(lib.globalProfile), interrupted }
}