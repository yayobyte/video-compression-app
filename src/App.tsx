import { useEffect, useRef, useState } from 'react'
import type { Profile } from '../shared/domain'
import type { BrowserDirectoryHandle, PreviewSelection, VideoAsset } from './types'
import { inspectVideo } from './utils/inspect'
import useEncoder from './hooks/useEncoder'
import useImport from './hooks/useImport'
import usePersistence from './hooks/usePersistence'
import useWakeLock from './hooks/useWakeLock'
import ControlBar from './components/ControlBar'
import EmptyState from './components/EmptyState'
import FooterNote from './components/FooterNote'
import Hero from './components/Hero'
import Notice from './components/Notice'
import PreviewModal from './components/PreviewModal'
import TopBar from './components/TopBar'
import Toolbar from './components/Toolbar'
import VideoCard from './components/VideoCard'
import './App.css'

function App() {
  const [videos, setVideos] = useState<VideoAsset[]>([])
  const [globalProfile, setGlobalProfile] = useState<Profile>({ codec: 'h265', crf: 25 })
  const [activePreview, setActivePreview] = useState<PreviewSelection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const directoryHandleRef = useRef<BrowserDirectoryHandle | null>(null)
  const videosRef = useRef<VideoAsset[]>([])

  useEffect(() => { videosRef.current = videos }, [videos])

  const updateVideo = (id: string, update: Partial<VideoAsset>) => {
    setVideos((current) => current.map((video) => video.id === id ? { ...video, ...update } : video))
  }

  const inspect = (asset: VideoAsset) => inspectVideo(asset, updateVideo)

  const wakeLock = useWakeLock()
  const encoder = useEncoder({ videos, videosRef, directoryHandleRef, updateVideo, setVideos, setNotice, wakeLock })
  const importer = useImport({ globalProfile, directoryHandleRef, folderInputRef, setVideos, setNotice, inspect })
  usePersistence({ videos, globalProfile, setGlobalProfile, setVideos, setNotice, inspect })

  // Release all object URLs on unmount.
  useEffect(() => () => {
    videosRef.current.forEach((video) => {
      URL.revokeObjectURL(video.url)
      if (video.outputUrl) URL.revokeObjectURL(video.outputUrl)
    })
  }, [])

  const applyGlobalProfile = () => setVideos((current) => current.map((video) =>
    video.status === 'ready' || video.status === 'completed' || video.status === 'failed' || video.status === 'cancelled'
      ? { ...video, profile: globalProfile, status: video.status === 'completed' ? 'ready' : video.status, progress: video.status === 'completed' ? 0 : video.progress, outputUrl: video.status === 'completed' ? undefined : video.outputUrl }
      : video))

  // Per-card codec/crf toggle: merging into the card's current profile and
  // resetting a completed card back to Ready (it must be re-converted).
  const setCardProfile = (id: string, patch: Partial<Profile>) => {
    setVideos((current) => current.map((video) => {
      if (video.id !== id) return video
      const wasCompleted = video.status === 'completed'
      return {
        ...video,
        profile: { ...video.profile, ...patch },
        status: wasCompleted ? 'ready' : video.status,
        progress: wasCompleted ? 0 : video.progress,
        outputUrl: wasCompleted ? undefined : video.outputUrl,
      }
    }))
  }

  const completed = videos.filter((video) => video.status === 'completed').length
  const canStart = videos.some((video) => ['ready', 'cancelled', 'failed'].includes(video.status))

  return (
    <main className="app-shell">
      <TopBar engineState={encoder.engineState} />

      <Hero />

      <ControlBar videoCount={videos.length} profile={globalProfile} onCodec={(codec) => setGlobalProfile((profile) => ({ ...profile, codec }))} onCrf={(crf) => setGlobalProfile((profile) => ({ ...profile, crf }))} onApply={applyGlobalProfile} />

      <Toolbar videoCount={videos.length} canStart={canStart} engineState={encoder.engineState} fileInputRef={fileInputRef} folderInputRef={folderInputRef} onFileChange={importer.onFileChange} onChooseFolder={() => void importer.chooseFolder()} onStartBatch={encoder.startBatch} />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      {!videos.length ? <EmptyState onChooseFolder={() => void importer.chooseFolder()} /> : <section className="video-grid">
        {videos.map((video) => <VideoCard key={video.id} video={video} onPreview={(version) => setActivePreview({ video, version })} onProfileChange={(patch) => setCardProfile(video.id, patch)} onConvert={() => encoder.startOne(video.id)} onCancel={() => encoder.cancel(video.id)} />)}
      </section>}
      {videos.length > 0 && <FooterNote completed={completed} />}

      {activePreview && <PreviewModal preview={activePreview} onClose={() => setActivePreview(null)} />}
    </main>
  )
}

export default App