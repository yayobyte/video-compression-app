import { useEffect, useRef, useState } from 'react'
import { hydrateLibrary, saveLibrary } from '../persistence'
import type { Profile } from '../domain'
import type { VideoAsset } from '../types'

type Options = {
  assets: VideoAsset[]
  globalProfile: Profile
  setAssets: React.Dispatch<React.SetStateAction<VideoAsset[]>>
  setGlobalProfile: React.Dispatch<React.SetStateAction<Profile>>
}

// Persists the asset list to AsyncStorage so the workspace survives app
// restarts (iOS can terminate an app that sits inactive for a while). Hydrates
// on mount (hydratingRef-guarded so the save effect can't wipe the stored data
// mid-restore) and debounce-saves on every change.
export default function usePersistence({ assets, globalProfile, setAssets, setGlobalProfile }: Options) {
  const [notice, setNotice] = useState<string | null>(null)
  const hydratingRef = useRef(false)

  useEffect(() => {
    if (hydratingRef.current) return
    hydratingRef.current = true
    void (async () => {
      try {
        const { assets: restored, globalProfile: restoredProfile, interrupted } = await hydrateLibrary()
        if (!restored.length) return
        setGlobalProfile(restoredProfile)
        setAssets(restored)
        setNotice(
          `Restored ${restored.length} video${restored.length === 1 ? '' : 's'} from the previous session` +
            (interrupted ? ` — ${interrupted} interrupted encode${interrupted === 1 ? '' : 's'} reset to Ready` : '') +
            '.',
        )
      } catch {
        // persistence is best-effort
      } finally {
        hydratingRef.current = false
      }
    })()
  }, [])

  useEffect(() => {
    if (hydratingRef.current) return
    const timer = setTimeout(() => {
      void saveLibrary({
        globalProfile,
        assets: assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          size: asset.size,
          uri: asset.uri,
          profile: asset.profile,
          status: asset.status,
          outputUri: asset.outputUri,
          outputSize: asset.outputSize,
          sourceDeleted: asset.sourceDeleted,
        })),
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [assets, globalProfile])

  return { notice }
}