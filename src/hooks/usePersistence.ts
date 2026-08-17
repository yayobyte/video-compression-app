import { useEffect, useRef } from 'react'
import { getOutputFile, getSourceFile, getWorkspaceMeta, saveWorkspaceMeta } from '../persistence'
import type { PersistedProfile } from '../persistence'
import type { Profile } from '../../shared/domain'
import type { VideoAsset } from '../types'

type Options = {
  videos: VideoAsset[]
  globalProfile: Profile
  setGlobalProfile: React.Dispatch<React.SetStateAction<Profile>>
  setVideos: React.Dispatch<React.SetStateAction<VideoAsset[]>>
  setNotice: React.Dispatch<React.SetStateAction<string | null>>
  inspect: (asset: VideoAsset) => void
}

// Hydrates the workspace from IndexedDB on mount and debounce-saves it back on
// every change. A hydratingRef guards both effects (StrictMode safe).
export default function usePersistence({ videos, globalProfile, setGlobalProfile, setVideos, setNotice, inspect }: Options) {
  const hydratingRef = useRef(false)

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
          restored.forEach(inspect)
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
        videos: videos.map((video) => ({
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
}