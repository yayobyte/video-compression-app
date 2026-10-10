import * as FileSystem from 'expo-file-system/legacy'
import { TurboModuleRegistry } from 'react-native'
import { LONG_EDGE, outputNameFor } from './domain'
import type { Profile, Quality } from './domain'
import { ensureOutputsDir } from './storage'

// react-native-compressor is a Nitro module: its JS entry creates the native
// object at import time and throws when the native code isn't in the build
// (Expo Go). TurboModuleRegistry.get returns null there instead of throwing,
// so check it first and only require the library after the check passes.
export const isOnDeviceAvailable = () => {
  if (!TurboModuleRegistry.get('NitroModules')) return false
  try {
    const { NitroModules } = require('react-native-nitro-modules')
    return NitroModules.hasHybridObject('Compressor') as boolean
  } catch {
    return false
  }
}

// The hardware encoder takes a bitrate, not a quality level. Bits per pixel per
// frame set it (high 0.09 ≈ 5.6 Mbps for 1080p30). Metadata has no frame rate,
// so 30 is assumed. Never aim above 80% of the source bitrate, or the
// "compressed" file grows.
const BITS_PER_PIXEL: Record<Quality, number> = { high: 0.09, balanced: 0.06, small: 0.04 }
const ASSUMED_FRAME_RATE = 30
const MIN_BITRATE = 500_000
const MAX_SOURCE_SHARE = 0.8

type VideoMeta = { width: number; height: number; size: number; duration: number }

// maxSize is the output's long edge: the source's own (never upscale) or the
// chosen resolution step. The bitrate follows the pixels actually encoded.
export const settingsFor = (meta: VideoMeta, profile: Profile) => {
  const longEdge = Math.max(meta.width, meta.height)
  const maxSize = profile.maxResolution === 'original' ? longEdge : Math.min(LONG_EDGE[profile.maxResolution], longEdge)
  const scale = longEdge > 0 ? maxSize / longEdge : 1
  const pixels = meta.width * meta.height * scale * scale
  const target = pixels * ASSUMED_FRAME_RATE * BITS_PER_PIXEL[profile.quality]
  const sourceBitrate = meta.duration > 0 ? (meta.size * 8) / meta.duration : 0
  const ceiling = sourceBitrate > 0 ? sourceBitrate * MAX_SOURCE_SHARE : target
  const bitrate = Math.round(Math.max(MIN_BITRATE, Math.min(target, ceiling)))
  return { bitrate, maxSize }
}

export type CompressResult = {
  outputUri: string
  outputSize: number
  outputName: string
}

export type CompressOptions = {
  fileUri: string
  fileName: string
  profile: Profile
  onProgress: (percent: number) => void
  // Called with a cancel function once the native job has an id.
  registerCancel?: (cancel: () => void) => void
}

// H.264 only: react-native-compressor has no HEVC output.
export const compressVideo = async (options: CompressOptions): Promise<CompressResult> => {
  if (!isOnDeviceAvailable()) {
    throw new Error('Compression needs a dev or Release build of the app (it is not available in Expo Go).')
  }
  const { Video, getVideoMetaData } = require('react-native-compressor')
  options.onProgress(0)
  const meta = await getVideoMetaData(options.fileUri)
  const { bitrate, maxSize } = settingsFor(meta, options.profile)

  // iOS stops the hardware encoder when the app is backgrounded; the
  // background task asks the system for extra time to finish.
  await Video.activateBackgroundTask().catch(() => undefined)
  try {
    const output: string = await Video.compress(
      options.fileUri,
      {
        // 'auto' ignores bitrate and downscales to 640px; manual honors both.
        compressionMethod: 'manual',
        bitrate,
        maxSize,
        getCancellationId: (id: string) => options.registerCancel?.(() => Video.cancelCompression(id)),
      },
      (progress: number) => options.onProgress(Math.max(0, Math.min(99, Math.round(progress * 100)))),
    )
    const tempUri = output.startsWith('file://') ? output : `file://${output}`
    const outputName = outputNameFor(options.fileName, options.profile)
    const dest = `${await ensureOutputsDir()}${outputName}`
    await FileSystem.deleteAsync(dest, { idempotent: true })
    await FileSystem.moveAsync({ from: tempUri, to: dest })
    const info = await FileSystem.getInfoAsync(dest)
    const outputSize = info.exists && !info.isDirectory ? info.size : 0
    return { outputUri: dest, outputSize, outputName }
  } finally {
    await Video.deactivateBackgroundTask().catch(() => undefined)
  }
}
