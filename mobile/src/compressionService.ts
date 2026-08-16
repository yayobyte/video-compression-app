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

export type CompressOptions = {
  serverUrl: string
  fileUri: string
  fileName: string
  codec: Codec
  crf: Crf
  onProgress: (percent: number) => void
  onPhase: (phase: 'uploading' | 'compressing') => void
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
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'video/mp4',
        parameters: { codec, crf: String(crf), filename: fileName },
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
      const download = await FileSystem.downloadAsync(`${base}/api/jobs/${job.id}/output`, dest)
      if (download.status !== 200) throw new Error(`Download failed (${download.status}).`)
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