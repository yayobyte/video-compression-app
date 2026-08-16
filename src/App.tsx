import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core-mt?url'
import wasmURL from '@ffmpeg/core-mt/wasm?url'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
const coreWorkerURL = '/ffmpeg-core.worker.js'
import { getOutputFile, getSourceFile, getWorkspaceMeta, saveOutputFile, saveSourceFile, saveWorkspaceMeta } from './persistence'
import type { PersistedProfile } from './persistence'
import { formatBytes, outputNameFor } from '../shared/domain'
import type { Codec, Crf } from '../shared/domain'
import './App.css'

type JobStatus = 'ready' | 'queued' | 'converting' | 'completed' | 'failed' | 'cancelled'
type BrowserFileHandle = { kind: 'file'; getFile: () => Promise<File> }
type BrowserDirectoryHandle = {
  values: () => AsyncIterable<BrowserFileHandle | { kind: string }>
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>
}
type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<BrowserDirectoryHandle> }

type VideoAsset = {
  id: string
  file: File
  sourceHandle?: BrowserFileHandle
  name: string
  size: number
  url: string
  duration?: number
  width?: number
  height?: number
  resolution?: string
  profile: { codec: Codec; crf: Crf }
  progress: number
  status: JobStatus
  outputUrl?: string
  outputName?: string
  outputSize?: number
  error?: string
}

const extensionFrom = (name: string) => name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'mp4'

const formatDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return 'Reading…'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

const MAX_ENCODE_PIXELS = 1080 * 2400

const isCompleteMp4 = (data: Uint8Array) => {
  if (data.length < 8) return false
  const text = new TextDecoder().decode(data)
  return text.slice(0, 64).includes('ftyp') && /moov/.test(text)
}

function App() {
  const [videos, setVideos] = useState<VideoAsset[]>([])
  const [globalProfile, setGlobalProfile] = useState<{ codec: Codec; crf: Crf }>({ codec: 'h265', crf: 25 })
  const [activePreview, setActivePreview] = useState<{ video: VideoAsset; version: 'original' | 'compressed' } | null>(null)
  const [engineState, setEngineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const directoryHandleRef = useRef<BrowserDirectoryHandle | null>(null)
  const videosRef = useRef<VideoAsset[]>([])
  const activeJobRef = useRef<string | null>(null)
  const cancelledJobsRef = useRef(new Set<string>())
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const hydratingRef = useRef(false)

  useEffect(() => { videosRef.current = videos }, [videos])

  const grabWakeLock = async () => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
    if (typeof wakeLock?.request !== 'function') return
    try {
      wakeLockRef.current = await wakeLock.request('screen')
    } catch { /* wake lock unavailable, continue without it */ }
  }

  const releaseWakeLock = () => {
    void wakeLockRef.current?.release()
    wakeLockRef.current = null
  }
  useEffect(() => () => {
    videosRef.current.forEach((video) => {
      URL.revokeObjectURL(video.url)
      if (video.outputUrl) URL.revokeObjectURL(video.outputUrl)
    })
    ffmpegRef.current?.terminate()
    releaseWakeLock()
  }, [])

  useEffect(() => {
    if (hydratingRef.current) return
    hydratingRef.current = true
    void (async () => {
      try {
        const meta = await getWorkspaceMeta()
        if (!meta || !meta.videos.length) return
        setGlobalProfile(meta.globalProfile)
        const restored: VideoAsset[] = []
        let interrupted = 0
        for (const item of meta.videos) {
          const source = await getSourceFile(item.id)
          if (!source) continue
          const resumed: Partial<VideoAsset> = { progress: 0 }
          if (item.status === 'completed') {
            const output = await getOutputFile(item.id)
            if (output) {
              resumed.status = 'completed'
              resumed.progress = 100
              resumed.outputUrl = URL.createObjectURL(output)
            } else {
              resumed.status = 'ready'
              interrupted += 1
            }
          } else if (item.status === 'converting' || item.status === 'queued') {
            resumed.status = 'ready'
            interrupted += 1
          }
          const file = new File([source], item.name, { type: item.type, lastModified: item.lastModified })
          restored.push({
            id: item.id,
            file,
            name: item.name,
            size: item.size,
            url: URL.createObjectURL(file),
            profile: item.profile,
            outputName: item.outputName,
            outputSize: item.outputSize,
            status: resumed.status ?? item.status,
            progress: resumed.progress ?? 0,
            outputUrl: resumed.outputUrl,
          })
        }
        if (restored.length) {
          setVideos(restored)
          restored.forEach(inspectVideo)
          setNotice(`Restored ${restored.length} video${restored.length === 1 ? '' : 's'} from the previous session${interrupted ? ` — ${interrupted} interrupted encode${interrupted === 1 ? '' : 's'} reset to Ready` : ''}.`)
        }
      } catch { /* persistence is best-effort */ } finally {
        hydratingRef.current = false
      }
    })()
  }, [])

  useEffect(() => {
    if (hydratingRef.current) return
    const timer = window.setTimeout(() => {
      const persisted: PersistedProfile = globalProfile
      void saveWorkspaceMeta({
        globalProfile: persisted,
        videos: videosRef.current.map((video) => ({
          id: video.id,
          name: video.name,
          size: video.size,
          type: video.file.type,
          lastModified: video.file.lastModified,
          profile: video.profile,
          status: video.status,
          outputName: video.outputName,
          outputSize: video.outputSize,
        })),
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [videos, globalProfile])

  const updateVideo = (id: string, update: Partial<VideoAsset>) => {
    setVideos((current) => current.map((video) => video.id === id ? { ...video, ...update } : video))
  }

  const inspectVideo = (asset: VideoAsset) => {
    const element = document.createElement('video')
    element.preload = 'metadata'
    element.src = asset.url
    element.onloadedmetadata = () => {
      updateVideo(asset.id, { duration: element.duration, width: element.videoWidth, height: element.videoHeight, resolution: `${element.videoWidth} × ${element.videoHeight}` })
      element.removeAttribute('src')
      element.load()
    }
  }

  const addFiles = (files: File[], handles: Map<string, BrowserFileHandle> = new Map()) => {
    const assets = files.filter((file) => file.type.startsWith('video/')).map((file) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      file,
      sourceHandle: handles.get(`${file.name}-${file.lastModified}-${file.size}`),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      profile: globalProfile,
      progress: 0,
      status: 'ready' as const,
    }))
    setVideos((current) => [...current, ...assets.filter((asset) => !current.some((video) => video.id === asset.id))])
    assets.forEach((asset) => void saveSourceFile(asset.id, asset.file))
    assets.forEach(inspectVideo)
    if (assets.length) setNotice(`${assets.length} video${assets.length === 1 ? '' : 's'} added locally.`)
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const chooseFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      folderInputRef.current?.click()
      return
    }
    try {
      const handle = await picker()
      directoryHandleRef.current = handle
      const files: File[] = []
      const handles = new Map<string, BrowserFileHandle>()
      for await (const entry of handle.values()) {
        if (entry.kind !== 'file') continue
        const fileHandle = entry as BrowserFileHandle
        const file = await fileHandle.getFile()
        if (!file.type.startsWith('video/')) continue
        files.push(file)
        handles.set(`${file.name}-${file.lastModified}-${file.size}`, fileHandle)
      }
      addFiles(files, handles)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setNotice('The folder could not be opened. You can still add individual files.')
    }
  }

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
      void grabWakeLock()
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
      releaseWakeLock()
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

  useEffect(() => {
    if (activeJobRef.current || videos.some((video) => video.status === 'converting')) return
    const queued = videos.find((video) => video.status === 'queued')
    if (queued) void runConversion(queued.id)
  }, [videos])

  const startOne = (id: string) => {
    setVideos((current) => current.map((video) => video.id === id ? { ...video, status: 'queued', progress: 0, error: undefined } : video))
  }

  const cancel = (id: string) => {
    cancelledJobsRef.current.add(id)
    releaseWakeLock()
    if (activeJobRef.current === id) {
      ffmpegRef.current?.terminate()
      ffmpegRef.current = null
      activeJobRef.current = null
      setEngineState('idle')
    }
    updateVideo(id, { status: 'cancelled', progress: 0 })
    setNotice('Conversion cancelled. The local encoder will reload for the next job.')
  }

  const applyGlobalProfile = () => setVideos((current) => current.map((video) =>
    video.status === 'ready' || video.status === 'completed' || video.status === 'failed' || video.status === 'cancelled'
      ? { ...video, profile: globalProfile, status: video.status === 'completed' ? 'ready' : video.status, progress: video.status === 'completed' ? 0 : video.progress, outputUrl: video.status === 'completed' ? undefined : video.outputUrl }
      : video))

  const completed = videos.filter((video) => video.status === 'completed').length
  const canStart = videos.some((video) => ['ready', 'cancelled', 'failed'].includes(video.status))

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Clippress home"><span className="brand-mark">◒</span> clippress</a>
        <div className="topbar-actions"><span className={`local-pill ${engineState}`}><span className="signal" /> {engineState === 'ready' ? 'Local encoder ready' : engineState === 'loading' ? 'Loading local encoder' : 'Local-only processing'}</span><button className="avatar" aria-label="Account menu">Y</button></div>
      </header>

      <section className="hero" id="top"><div className="eyebrow">VIDEO WORKSPACE <span>•</span> CHROME + IPHONE</div><h1>Make your video library<br /><em>lighter.</em></h1><p>Review your footage, choose a profile, and convert locally. Your originals stay where they are.</p></section>

      <section className="control-bar" aria-label="Compression controls">
        <div className="folder-summary"><span className="folder-icon">⌁</span><div><span className="label">WORKSPACE</span><strong>{videos.length ? `${videos.length} videos loaded` : 'No folder selected'}</strong></div></div>
        <div className="profile-controls">
          <div className="profile-group"><span className="label">CODEC</span><div className="segmented">{(['h265', 'h264'] as Codec[]).map((codec) => <button key={codec} onClick={() => setGlobalProfile((profile) => ({ ...profile, codec }))} className={globalProfile.codec === codec ? 'selected' : ''}>{codec === 'h265' ? 'H.265 / HEVC' : 'H.264'}</button>)}</div></div>
          <div className="profile-group"><span className="label">QUALITY</span><div className="segmented">{([25, 28] as Crf[]).map((crf) => <button key={crf} onClick={() => setGlobalProfile((profile) => ({ ...profile, crf }))} className={globalProfile.crf === crf ? 'selected' : ''}>CRF {crf}</button>)}</div></div>
        </div>
        <button className="apply-button" onClick={applyGlobalProfile} disabled={!videos.length}>Apply to all</button>
      </section>

      <section className="toolbar">
        <div><span className="count">{videos.length}</span> <span className="muted">videos in this workspace</span></div>
        <div className="toolbar-actions">
          <input ref={folderInputRef} className="visually-hidden" type="file" multiple {...({ webkitdirectory: '' } as Record<string, string>)} onChange={onFileChange} />
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*" multiple onChange={onFileChange} />
          <button className="button-secondary" onClick={() => void chooseFolder()}>Choose folder</button><button className="button-secondary" onClick={() => fileInputRef.current?.click()}>Add files</button><button className="button-primary" disabled={!canStart || engineState === 'loading'} onClick={startBatch}><span>↻</span> Convert batch</button>
        </div>
      </section>

      {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}

      {!videos.length ? <section className="empty-state"><div className="empty-icon">▣</div><h2>Your workspace is empty.</h2><p>Choose a folder in Chrome or add a few files to start reviewing your videos.</p><button className="button-primary" onClick={() => void chooseFolder()}>Choose a video folder</button><small>Files stay on this device. The encoder downloads once when you first convert.</small></section> : <section className="video-grid">
        {videos.map((video) => <article className="video-card" key={video.id}>
          <button className="thumbnail" onClick={() => setActivePreview({ video, version: 'original' })} aria-label={`Preview ${video.name}`}><video src={video.url} muted preload="metadata" /><span className="play">▶</span><span className="duration">{formatDuration(video.duration)}</span></button>
          <div className="card-body">
            <div className="card-title"><h2 title={video.name}>{video.name}</h2><span className={`status ${video.status}`}>{video.status === 'ready' ? 'Ready' : video.status}</span></div>
            <div className="metadata"><span>{formatBytes(video.size)}</span><span>{video.resolution ?? 'Reading…'}</span><span>{video.file.type.replace('video/', '').toUpperCase() || 'VIDEO'}</span></div>
            <div className="card-profile"><div className="mini-segmented">{(['h265', 'h264'] as Codec[]).map((codec) => <button key={codec} disabled={video.status === 'converting' || video.status === 'queued'} onClick={() => updateVideo(video.id, { profile: { ...video.profile, codec }, status: video.status === 'completed' ? 'ready' : video.status, progress: video.status === 'completed' ? 0 : video.progress, outputUrl: video.status === 'completed' ? undefined : video.outputUrl })} className={video.profile.codec === codec ? 'selected' : ''}>{codec.toUpperCase()}</button>)}</div><div className="mini-segmented">{([25, 28] as Crf[]).map((crf) => <button key={crf} disabled={video.status === 'converting' || video.status === 'queued'} onClick={() => updateVideo(video.id, { profile: { ...video.profile, crf }, status: video.status === 'completed' ? 'ready' : video.status, progress: video.status === 'completed' ? 0 : video.progress, outputUrl: video.status === 'completed' ? undefined : video.outputUrl })} className={video.profile.crf === crf ? 'selected' : ''}>{crf}</button>)}</div></div>
            {(video.status === 'converting' || video.status === 'queued') && <div className="progress-wrap"><div className="progress-label"><span>{video.status === 'queued' ? 'Queued locally' : video.progress < 2 ? 'Preparing encoder' : 'Converting locally'}</span><span>{video.status === 'queued' ? 'Waiting' : `${video.progress}%`}</span></div><div className="progress"><span style={{ width: `${video.status === 'queued' ? 0 : video.progress}%` }} /></div></div>}
            {video.status === 'completed' && <div className="completed-row"><span>✓ {formatBytes(video.outputSize)} compressed</span><button onClick={() => setActivePreview({ video, version: 'compressed' })}>Open compressed</button></div>}
            {video.status === 'failed' && <p className="error-message">{video.error}</p>}
            <div className="card-actions"><button className="link-button" onClick={() => setActivePreview({ video, version: 'original' })}>Open original</button>{video.status === 'converting' || video.status === 'queued' ? <button className="link-button danger" onClick={() => cancel(video.id)}>Cancel</button> : <button className="convert-button" onClick={() => startOne(video.id)}>{video.status === 'completed' ? 'Re-convert' : video.status === 'failed' ? 'Try again' : 'Convert'}</button>}</div>
          </div>
        </article>)}
      </section>}
      {videos.length > 0 && <footer className="footer-note"><span className="dot" /> {completed} completed · Browser conversion uses FFmpeg/WASM and may be slow for large 4K files.</footer>}

      {activePreview && <div className="modal-backdrop" role="presentation" onMouseDown={() => setActivePreview(null)}><section className="preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${activePreview.video.name}`} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="label">{activePreview.version === 'original' ? 'ORIGINAL VIDEO' : 'COMPRESSED VIDEO'}</span><h2>{activePreview.version === 'compressed' ? activePreview.video.outputName : activePreview.video.name}</h2></div><button className="close-button" onClick={() => setActivePreview(null)} aria-label="Close preview">×</button></div><video className="preview-video" controls autoPlay src={activePreview.version === 'compressed' ? activePreview.video.outputUrl : activePreview.video.url} /><div className="modal-foot"><span>{activePreview.version === 'compressed' ? formatBytes(activePreview.video.outputSize) : formatBytes(activePreview.video.size)} · {activePreview.video.resolution ?? 'Video'}</span><span>{activePreview.version === 'compressed' ? 'Generated locally in this browser.' : 'Your source file has not been changed.'}</span></div></section></div>}
    </main>
  )
}

export default App
