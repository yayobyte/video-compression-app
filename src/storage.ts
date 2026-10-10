import * as FileSystem from 'expo-file-system/legacy'
import { outputNameFor } from './domain'
import type { Profile } from './domain'

// Finished outputs live in Documents/clippress/: persistent, and visible in the
// iOS Files app ("On My iPhone › Clippress"). On Android the folder is private
// to the app; "Save to gallery" copies outputs out.
const OUTPUTS_DIR = `${FileSystem.documentDirectory ?? ''}clippress/`

export const ensureOutputsDir = async () => {
  try {
    await FileSystem.makeDirectoryAsync(OUTPUTS_DIR, { intermediates: true })
  } catch {
    // already exists
  }
  return OUTPUTS_DIR
}

// Debug helper: log where the app stores things and what's actually on disk.
export const logStorageState = async () => {
  const docs = FileSystem.documentDirectory ?? '(none)'
  const cache = FileSystem.cacheDirectory ?? '(none)'
  console.log('[storage] documentDirectory:', docs)
  console.log('[storage] cacheDirectory:', cache)

  const list = async (dir: string) => {
    try {
      const names = await FileSystem.readDirectoryAsync(dir)
      const entries = await Promise.all(names.map(async (name) => {
        const info = await FileSystem.getInfoAsync(`${dir}${name}`).catch(() => null)
        const size = info?.exists && !info?.isDirectory ? info.size : null
        return size === null ? `📁 ${name}` : `📄 ${name} (${size} bytes)`
      }))
      console.log(`[storage] ${dir}:`, entries.length ? entries.join(', ') : '(empty)')
    } catch (error) {
      console.log(`[storage] ${dir}:`, 'not readable —', error instanceof Error ? error.message : String(error))
    }
  }

  await list(OUTPUTS_DIR)
  await list(cache)

  // Also log the full-disk picture (matches what iOS Settings reports).
  const roots = await inspectStorage()
  for (const root of roots) {
    console.log(`[storage] ${root.label} total: ${root.size} bytes —`, root.entries.slice(0, 8).map((e) => `${e.name} (${e.size})`).join(', ') || '(empty)')
  }
  console.log('[storage] TOTAL on disk:', roots.reduce((sum, root) => sum + root.size, 0), 'bytes')
}

export type StorageStats = {
  outputs: { count: number; bytes: number }
  cache: { count: number; bytes: number }
}

// ---- Full-disk inspection ---------------------------------------------------
// iOS Settings reports the whole app sandbox (Documents + Library + tmp). The
// app-level counters above only track the folders we know about, so they can be
// hundreds of MB off. This scans every storage root recursively and reports the
// real on-disk sizes so we can see where the space actually goes.

export type StorageEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number
}

export type StorageRoot = {
  label: string
  path: string
  size: number
  entries: StorageEntry[]
}

const SANDSCAN_DEPTH = 5

// sandbox/<App>/Library/Caches/  →  sandbox/<App>/tmp/ + Library/Application Support
const deriveRoots = (cacheDirectory: string): { appSupport: string | null; tmp: string | null } => {
  const library = cacheDirectory.replace(/Caches\/?$/, '')
  const appSupport = library ? `${library}Application Support/` : null
  const appRoot = library.slice(0, library.lastIndexOf('Library/') + 1)
  return { appSupport, tmp: appRoot ? `${appRoot}tmp/` : null }
}

const dirSize = async (dir: string, depth = 0): Promise<number> => {
  if (depth > SANDSCAN_DEPTH) return 0
  try {
    const names = await FileSystem.readDirectoryAsync(dir)
    let total = 0
    for (const name of names) {
      const info = await FileSystem.getInfoAsync(`${dir}${name}`).catch(() => null)
      if (!info?.exists) continue
      total += info.isDirectory ? await dirSize(`${dir}${name}/`, depth + 1) : (info.size ?? 0)
    }
    return total
  } catch {
    return 0 // unreadable dir (permission or gone) — count as 0
  }
}

const listRoot = async (label: string, path: string): Promise<StorageRoot | null> => {
  try {
    const names = await FileSystem.readDirectoryAsync(path)
    const entries = await Promise.all(names.map(async (name) => {
      const info = await FileSystem.getInfoAsync(`${path}${name}`).catch(() => null)
      if (!info?.exists) return null
      const size = info.isDirectory ? await dirSize(`${path}${name}/`) : (info.size ?? 0)
      return { name, path: `${path}${name}`, isDirectory: !!info.isDirectory, size }
    }))
    return {
      label,
      path,
      size: entries.reduce((sum, entry) => sum + (entry?.size ?? 0), 0),
      entries: entries.filter((entry): entry is StorageEntry => entry !== null).sort((a, b) => b.size - a.size),
    }
  } catch {
    return null // root doesn't exist yet (e.g. no tmp/ created)
  }
}

// Recursively report every file the app owns on disk, per storage root.
export const inspectStorage = async (): Promise<StorageRoot[]> => {
  const docs = FileSystem.documentDirectory ?? ''
  const cache = FileSystem.cacheDirectory ?? ''
  const { appSupport, tmp } = deriveRoots(cache)
  const roots = await Promise.all([
    listRoot('Documents', docs), // clippress/ + whatever else the picker wrote
    listRoot('Caches (Library)', cache),
    appSupport ? listRoot('Application Support', appSupport) : Promise.resolve(null),
    tmp ? listRoot('tmp (temporary)', tmp) : Promise.resolve(null),
  ])
  return roots.filter((root): root is StorageRoot => root !== null)
}

// Matches current output names and the older codec/CRF ones (….h264.crf25.mp4).
const CACHE_ORPHAN = /\.compressed\.([a-z]+\.(original|\d+p)|h2\d+\.crf\d+)\.mp4$/i

type DirFilter = RegExp | ((name: string) => boolean)

const summarizeDir = async (dir: string, filter?: DirFilter): Promise<{ count: number; bytes: number }> => {
  try {
    const names = await FileSystem.readDirectoryAsync(dir)
    let count = 0
    let bytes = 0
    for (const name of names) {
      if (filter instanceof RegExp ? !filter.test(name) : filter && !filter(name)) continue
      const info = await FileSystem.getInfoAsync(`${dir}${name}`).catch(() => null)
      if (info?.exists && !info.isDirectory) {
        count += 1
        bytes += info.size ?? 0
      }
    }
    return { count, bytes }
  } catch {
    return { count: 0, bytes: 0 }
  }
}

// Storage usage for the "no videos imported" banner: finished outputs in the
// persistent clippress/ folder + orphaned compressed files left in cache.
export const getStorageStats = async (): Promise<StorageStats> => {
  const cache = FileSystem.cacheDirectory ?? ''
  const [outputs, cacheCount] = await Promise.all([
    summarizeDir(OUTPUTS_DIR),
    summarizeDir(cache, CACHE_ORPHAN),
  ])
  return { outputs, cache: cacheCount }
}

// Delete finished outputs in clippress/, orphaned compressed files in cache,
// the DocumentPicker/ source-copy folder, and anything left in the app's tmp/.
// Application Support is deliberately untouched (AsyncStorage/Expo-managed).
export const clearStoredFiles = async (): Promise<StorageStats> => {
  const cache = FileSystem.cacheDirectory ?? ''
  const { tmp } = deriveRoots(cache)
  const clearDir = async (dir: string, filter?: DirFilter) => {
    try {
      const names = await FileSystem.readDirectoryAsync(dir)
      for (const name of names) {
        if (filter instanceof RegExp ? !filter.test(name) : filter && !filter(name)) continue
        await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(() => undefined)
      }
    } catch {
      // nothing readable — nothing to clear
    }
  }
  // Also remove the DocumentPicker/ folder (copies of imported sources) and
  // anything else the app put in cache that isn't an Expo-managed asset.
  const cacheExtra = (name: string) => name === 'DocumentPicker'
  await Promise.all([
    clearDir(OUTPUTS_DIR),
    clearDir(cache, CACHE_ORPHAN),
    clearDir(cache, cacheExtra),
    tmp ? clearDir(tmp) : Promise.resolve(),
  ])
  return getStorageStats()
}

// Delete one imported source copy (the per-card "Delete original" action).
// Removes exactly that file and nothing else — the compressed output in
// clippress/ and every other card are untouched.
export const deleteSourceFile = async (uri: string) => {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    // already gone
  }
}

export const findExistingCompressed = async (fileName: string, profile: Profile) => {
  const outputName = outputNameFor(fileName, profile)
  const dir = await ensureOutputsDir()
  const info = await FileSystem.getInfoAsync(`${dir}${outputName}`)
  if (info.exists && !info.isDirectory && info.size > 0) {
    return { outputUri: info.uri, outputSize: info.size, outputName }
  }
  return null
}
