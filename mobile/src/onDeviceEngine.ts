import * as FileSystem from 'expo-file-system/legacy'
import { TurboModuleRegistry } from 'react-native'
import { outputNameFor } from '../../shared/domain'
import type { Crf } from '../../shared/domain'
import { ensureOutputsDir } from './compressionService'
import type { CompressResult } from './compressionService'

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

// The hardware encoder takes a bitrate, not a CRF. Bits per pixel per frame
// stand in for the server's CRF (0.09 ≈ 5.6 Mbps for 1080p30). Metadata has no
// frame rate, so 30 is assumed. Never aim above 80% of the source bitrate, or
// the "compressed" file grows.
const BITS_PER_PIXEL: Record<Crf, number> = { 25: 0.09, 28: 0.06 }
const ASSUMED_FRAME_RATE = 30
const MIN_BITRATE = 1_000_000
const MAX_SOURCE_SHARE = 0.8

export const bitrateFor = (meta: { width: number; height: number; size: number; duration: number }, crf: Crf) => {
  const target = meta.width * meta.height * ASSUMED_FRAME_RATE * BITS_PER_PIXEL[crf]
  const sourceBitrate = meta.duration > 0 ? (meta.size * 8) / meta.duration : 0
  const ceiling = sourceBitrate > 0 ? sourceBitrate * MAX_SOURCE_SHARE : target
  return Math.round(Math.max(MIN_BITRATE, Math.min(target, ceiling)))
}

export type OnDeviceOptions = {
  fileUri: string
  fileName: string
  crf: Crf
  onProgress: (percent: number) => void
  // Called with a cancel function once the native job has an id.
  registerCancel?: (cancel: () => void) => void
}

// H.264 only: react-native-compressor has no HEVC output.
export const compressOnDevice = async (options: OnDeviceOptions): Promise<CompressResult> => {
  if (!isOnDeviceAvailable()) {
    throw new Error('On-device compression needs a dev or Release build of the app (it is not available in Expo Go).')
  }
  const { Video, getVideoMetaData } = require('react-native-compressor')
  options.onProgress(0)
  const meta = await getVideoMetaData(options.fileUri)
  const bitrate = bitrateFor(meta, options.crf)

  // iOS stops the hardware encoder when the app is backgrounded; the
  // background task asks the system for extra time to finish.
  await Video.activateBackgroundTask().catch(() => undefined)
  try {
    const output: string = await Video.compress(
      options.fileUri,
      {
        compressionMethod: 'manual',
        bitrate,
        // The default downscales to 1920px (640px in auto mode). Keep the source size.
        maxSize: Math.max(meta.width, meta.height),
        getCancellationId: (id: string) => options.registerCancel?.(() => Video.cancelCompression(id)),
      },
      (progress: number) => options.onProgress(Math.max(0, Math.min(99, Math.round(progress * 100)))),
    )
    const tempUri = output.startsWith('file://') ? output : `file://${output}`
    const outputName = outputNameFor(options.fileName, 'h264', options.crf)
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
