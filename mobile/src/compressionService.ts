import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import { outputNameFor } from '../../shared/domain'
import type { Codec, Crf } from '../../shared/domain'

const DEFAULT_PORT = 8787
const URL_KEY = 'clippress.serverUrl'
const OUTPUTS_DIR = `${FileSystem.documentDirectory ?? ''}clippress/`

const ensureOutputsDir = async () => {
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
}

export type StorageStats = {
  outputs: { count: number; bytes: number }
  cache: { count: number; bytes: number }
}

const CACHE_ORPHAN = /\.compressed\.h2\d+\.crf\d+\.mp4$/i

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

// Delete finished outputs in clippress/ and orphaned compressed files in cache.
export const clearStoredFiles = async (): Promise<StorageStats> => {
  const cache = FileSystem.cacheDirectory ?? ''
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
  await Promise.all([clearDir(OUTPUTS_DIR), clearDir(cache, CACHE_ORPHAN), clearDir(cache, cacheExtra)])
  return getStorageStats()
}

export const findExistingCompressed = async (fileName: string, codec: Codec, crf: Crf) => {
  const outputName = outputNameFor(fileName, codec, crf)
  const dir = await ensureOutputsDir()
  const info = await FileSystem.getInfoAsync(`${dir}${outputName}`)
  if (info.exists && !info.isDirectory && info.size > 0) {
    return { outputUri: info.uri, outputSize: info.size, outputName }
  }
  return null
}

export const resolveServerUrl = async (): Promise<string> => {
  const stored = await AsyncStorage.getItem(URL_KEY).catch(() => null)
  if (stored) return stored.replace(/\/+$/, '')
  const hostUri = Constants.expoConfig?.hostUri
  if (hostUri) return `http://${hostUri.split(':')[0]}:${DEFAULT_PORT}`
  return ''
}

export const saveServerUrl = (url: string) => AsyncStorage.setItem(URL_KEY, url.trim().replace(/\/+$/, '')).catch(() => undefined)

export type ServerHealth = { ok: boolean; service?: string; error?: string }

export const checkServerHealth = async (serverUrl: string, timeoutMs = 4000): Promise<ServerHealth> => {
  const base = serverUrl.replace(/\/+$/, '')
  if (!base) return { ok: false, error: 'No compression service address set.' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/api/health`, { signal: controller.signal })
    if (!res.ok) return { ok: false, error: `Service responded ${res.status}.` }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; service?: string }
    return { ok: body.ok !== false, service: body.service }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

export type CompressOptions = {
  serverUrl: string
  fileUri: string
  fileName: string
  codec: Codec
  crf: Crf
  onProgress: (percent: number) => void
  onPhase: (phase: 'uploading' | 'compressing' | 'downloading') => void
}

export type CompressResult = {
  outputUri: string
  outputSize: number
  outputName: string
}

const uploadVideo = (
  url: string,
  fileUri: string,
  fileName: string,
  codec: Codec,
  crf: Crf,
  onUploadProgress: (percent: number) => void,
): Promise<{ status: number; text: string }> => {
  return new Promise((resolve, reject) => {
    const task = FileSystem.createUploadTask(
      url,
      fileUri,
      {
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        mimeType: 'video/mp4',
        // The iOS multipart path loads the whole file into memory before
        // sending (Data(contentsOf:)), which kills 1 GB+ uploads. Binary
        // content streams straight from the file — safe for any size.
        headers: {
          'Content-Type': 'video/mp4',
          'X-Codec': codec,
          'X-Crf': String(crf),
          'X-Filename': encodeURIComponent(fileName),
        },
      },
      (event) => {
        const { totalBytesSent, totalBytesExpectedToSend } = event
        if (totalBytesExpectedToSend > 0) {
          onUploadProgress(Math.max(0, Math.min(100, Math.round((totalBytesSent / totalBytesExpectedToSend) * 100))))
        }
      },
    )
    void task.uploadAsync().then(
      (result) => {
        if (!result) {
          reject(new Error('Upload was cancelled.'))
        } else if (result.status >= 200 && result.status < 300) {
          resolve({ status: result.status, text: result.body ?? '' })
        } else {
          reject(new Error(`Upload failed (${result.status}): ${(result.body ?? '').slice(0, 200)}`))
        }
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}

export const compressVideo = async (options: CompressOptions): Promise<CompressResult> => {
  const base = options.serverUrl.replace(/\/+$/, '')
  options.onPhase('uploading')
  options.onProgress(0)
  const response = await uploadVideo(
    `${base}/api/compress`,
    options.fileUri,
    options.fileName,
    options.codec,
    options.crf,
    options.onProgress,
  )
  let job: { id: string }
  try {
    job = JSON.parse(response.text)
  } catch {
    throw new Error('The compression service returned an unreadable response.')
  }
  if (!job?.id) throw new Error('The compression service did not return a job id.')

  options.onPhase('compressing')

  let progress = 0
  let outputName = ''
  for (let tries = 0; tries < 1800; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const status = await fetch(`${base}/api/jobs/${job.id}`)
    if (!status.ok) throw new Error(`Status check failed (${status.status}).`)
    const body = (await status.json()) as {
      status: string
      progress: number
      outputName?: string
      outputSize?: number
      error?: string
    }
    outputName = body.outputName ?? outputName
    if (body.progress !== progress) {
      progress = body.progress
      options.onProgress(progress)
    }
    if (body.status === 'completed') {
      const dest = `${await ensureOutputsDir()}${outputName}`
      options.onPhase('downloading')
      options.onProgress(0)
      // Download the output with real progress so the journey shows all three
      // steps (upload → compress → download) completing.
      const status = await new Promise<number>((resolve, reject) => {
        const task = FileSystem.createDownloadResumable(
          `${base}/api/jobs/${job.id}/output`,
          dest,
          {},
          (event) => {
            const { totalBytesWritten, totalBytesExpectedToWrite } = event
            if (totalBytesExpectedToWrite > 0) {
              options.onProgress(Math.max(0, Math.min(100, Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100))))
            }
          },
        )
        void task.downloadAsync().then(
          (result) => resolve(result?.status ?? 0),
          (error) => reject(error instanceof Error ? error : new Error(String(error))),
        )
      })
      if (status !== 200) throw new Error(`Download failed (${status}).`)
      const info = await FileSystem.getInfoAsync(dest)
      const outputSize = info.exists && !info.isDirectory ? info.size : 0
      void fetch(`${base}/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => undefined)
      return { outputUri: dest, outputSize, outputName }
    }
    if (body.status === 'failed') throw new Error(body.error || 'Conversion failed on the server.')
    if (body.status === 'queued' && progress === 0) options.onProgress(1)
  }
  throw new Error('Timed out waiting for the server.')
}