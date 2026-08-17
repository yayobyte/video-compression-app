import { useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core-mt?url'
import wasmURL from '@ffmpeg/core-mt/wasm?url'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
const coreWorkerURL = '/ffmpeg-core.worker.js'
import { saveOutputFile } from '../persistence'
import { outputNameFor } from '../../shared/domain'
import type { BrowserDirectoryHandle, EngineState, VideoAsset } from '../types'
import { MAX_ENCODE_PIXELS, extensionFrom, isCompleteMp4 } from '../utils/media'

type Options = {
  videos: VideoAsset[]
  videosRef: React.MutableRefObject<VideoAsset[]>
  directoryHandleRef: React.MutableRefObject<BrowserDirectoryHandle | null>
  updateVideo: (id: string, update: Partial<VideoAsset>) => void
  setVideos: React.Dispatch<React.SetStateAction<VideoAsset[]>>
  setNotice: React.Dispatch<React.SetStateAction<string | null>>
  wakeLock: { grab: () => Promise<void>; release: () => void }
}

// The browser-side FFmpeg encoder: loads the engine once, runs sequential
// conversions (one job at a time), and exposes batch/one-off/cancel controls.
export default function useEncoder({ videos, videosRef, directoryHandleRef, updateVideo, setVideos, setNotice, wakeLock }: Options) {
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const activeJobRef = useRef<string | null>(null)
  const cancelledJobsRef = useRef(new Set<string>())

  // Terminate the engine on unmount so the worker thread doesn't leak.
  useEffect(() => () => ffmpegRef.current?.terminate(), [])

  const ensureEngine = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current
    if (typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated) {
      setEngineState('error')
      throw new Error('This browser can\'t run the local encoder. The H.265 engine needs cross-origin isolation (SharedArrayBuffer): open the app in Chrome or Edge via the dev/preview server, or serve it with "Cross-Origin-Opener-Policy: same-origin" and "Cross-Origin-Embedder-Policy: require-corp".')
    }
    setEngineState('loading')
    try {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => {
        const id = activeJobRef.current
        if (id) updateVideo(id, { progress: Math.max(1, Math.min(99, Math.round(progress * 100))) })
      })
      await ffmpeg.load({ coreURL, wasmURL, workerURL: coreWorkerURL, classWorkerURL })
      ffmpegRef.current = ffmpeg
      setEngineState('ready')
      return ffmpeg
    } catch (error) {
      setEngineState('error')
      throw new Error(`Could not load the local FFmpeg engine: ${String(error)}`)
    }
  }

  const saveOutput = async (video: VideoAsset, blob: Blob, outputName: string) => {
    const directory = directoryHandleRef.current
    if (directory && video.sourceHandle) {
      try {
        const fileHandle = await directory.getFileHandle(outputName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return 'saved beside original'
      } catch {
        setNotice('Chrome could not write beside the original, so the compressed file was downloaded instead.')
      }
    }
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = outputName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    return 'downloaded'
  }

  const runConversion = async (id: string) => {
    if (activeJobRef.current) return
    const video = videosRef.current.find((item) => item.id === id)
    if (!video) return
    activeJobRef.current = id
    cancelledJobsRef.current.delete(id)
    updateVideo(id, { status: 'converting', progress: 1, error: undefined })
    if (video.width && video.height && video.width * video.height > MAX_ENCODE_PIXELS) {
      updateVideo(id, { status: 'failed', progress: 0, error: `This video is ${video.width} × ${video.height}, which is too large for the in-browser encoder — it runs out of memory above ${MAX_ENCODE_PIXELS.toLocaleString()} pixels (about 1080 × 2400). Use a smaller clip or the native desktop app for this one.` })
      activeJobRef.current = null
      return
    }
    const inputName = `input-${id}.${extensionFrom(video.name)}`
    const outputName = outputNameFor(video.name, video.profile.codec, video.profile.crf)
    try {
      void wakeLock.grab()
      const ffmpeg = await ensureEngine()
      await ffmpeg.writeFile(inputName, await fetchFile(video.file))
      const encoder = video.profile.codec === 'h264' ? 'libx264' : 'libx265'
      const threads = String(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 4)))
      const compat = video.profile.codec === 'h265' ? ['-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'] : []
      const args = ['-threads', threads, '-i', inputName, '-c:v', encoder, '-crf', String(video.profile.crf), '-preset', 'medium', '-threads', threads, '-c:a', 'aac', '-b:a', '128k', ...compat, outputName]
      await ffmpeg.exec(args)
      if (cancelledJobsRef.current.has(id)) return
      const data = await ffmpeg.readFile(outputName) as Uint8Array
      if (!isCompleteMp4(data)) {
        await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
        throw new Error('The encoder ran out of memory and stopped before finishing, so the output was incomplete. The in-browser engine cannot encode this video — try H.264 or a lower resolution.')
      }
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' })
      const outputUrl = URL.createObjectURL(blob)
      const location = await saveOutput(video, blob, outputName)
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
      void saveOutputFile(id, blob)
      updateVideo(id, { status: 'completed', progress: 100, outputName, outputSize: blob.size, outputUrl })
      setNotice(`${video.name} converted and ${location}.`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      if (!cancelledJobsRef.current.has(id)) updateVideo(id, { status: 'failed', progress: 0, error: detail || 'Conversion failed.' })
    } finally {
      wakeLock.release()
      activeJobRef.current = null
    }
  }

  const startBatch = () => {
    setVideos((current) => {
      const eligible = current.filter((video) => video.status === 'ready' || video.status === 'cancelled' || video.status === 'failed')
      if (!eligible.length) return current
      return current.map((video) => eligible.some((item) => item.id === video.id) ? { ...video, status: 'queued', progress: 0, error: undefined } : video)
    })
  }

  // Pump the queue: when nothing is running, pick up the next `queued` job.
  useEffect(() => {
    if (activeJobRef.current || videos.some((video) => video.status === 'converting')) return
    const queued = videos.find((video) => video.status === 'queued')
    if (queued) void runConversion(queued.id)
  }, [videos])

  const startOne = (id: string) => {
    updateVideo(id, { status: 'queued', progress: 0, error: undefined })
  }

  const cancel = (id: string) => {
    cancelledJobsRef.current.add(id)
    wakeLock.release()
    if (activeJobRef.current === id) {
      ffmpegRef.current?.terminate()
      ffmpegRef.current = null
      activeJobRef.current = null
      setEngineState('idle')
    }
    updateVideo(id, { status: 'cancelled', progress: 0 })
    setNotice('Conversion cancelled. The local encoder will reload for the next job.')
  }

  return { engineState, runConversion, startBatch, startOne, cancel }
}