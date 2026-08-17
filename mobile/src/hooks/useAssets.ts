import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Profile } from '../../../shared/domain'
import type { Codec, Crf } from '../../../shared/domain'
import { compressVideo, findExistingCompressed } from '../compressionService'
import type { VideoAsset } from '../types'

// Owns the video library state for the home screen: assets, global profile,
// busy/preview UI state, and all the side-effect handlers (import, convert,
// share, per-card profile, foreground recovery).
export default function useAssets(serverUrl: string, pingServer: (url: string) => void) {
  const [globalProfile, setGlobalProfile] = useState<Profile>({ codec: 'h265', crf: 25 })
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const serverUrlRef = useRef(serverUrl)
  serverUrlRef.current = serverUrl
  const pingServerRef = useRef(pingServer)
  pingServerRef.current = pingServer
  const assetsRef = useRef(assets)
  assetsRef.current = assets

  const updateAsset = (id: string, update: Partial<VideoAsset>) => {
    setAssets((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))
  }

  const importVideos = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true, multiple: true })
    if (result.canceled) return
    const incoming = result.assets
      .filter((asset): asset is typeof asset & { size?: number } => Boolean(asset.uri) && asset.name !== undefined)
      .map((asset) => ({
        id: `${asset.name}-${asset.size ?? 0}`,
        name: asset.name ?? 'video',
        size: asset.size ?? 0,
        uri: asset.uri,
        profile: globalProfile,
        status: 'ready' as const,
        progress: 0,
      }))
      .filter((asset) => !assets.some((existing) => existing.id === asset.id))
    if (!incoming.length) return
    setAssets((current) => [...current, ...incoming])
    for (const asset of incoming) {
      const existing = await findExistingCompressed(asset.name, asset.profile.codec, asset.profile.crf)
      if (existing) {
        updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: existing.outputUri, outputSize: existing.outputSize })
      }
    }
  }

  const runConvert = async (asset: VideoAsset) => {
    if (busy) return
    if (!serverUrl) {
      updateAsset(asset.id, { status: 'failed', progress: 0, error: 'Set the compression service address first, then try again.' })
      return
    }
    setBusy(true)
    updateAsset(asset.id, { status: 'converting', progress: 0, phase: 'uploading', error: undefined })
    try {
      const result = await compressVideo({
        serverUrl,
        fileUri: asset.uri,
        fileName: asset.name,
        codec: asset.profile.codec,
        crf: asset.profile.crf,
        onProgress: (percent) => updateAsset(asset.id, { progress: Math.max(0, percent) }),
        onPhase: (phase) => updateAsset(asset.id, { phase }),
      })
      updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: result.outputUri, outputSize: result.outputSize, error: undefined })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const offline = /network|failed to fetch|timed out|fetch|socket|connection/i.test(detail)
      updateAsset(asset.id, {
        status: 'failed',
        progress: 0,
        error: offline
          ? `No connection to the compression service at ${serverUrl}. Start it with \`npm run server\` in the server/ folder, then try again.`
          : detail,
      })
    } finally {
      setBusy(false)
    }
  }

  const runConvertRef = useRef(runConvert)
  runConvertRef.current = runConvert

  // When the app returns to the foreground, re-ping the service and resume any
  // card still stuck in `converting` (backgrounded mid-upload/compress).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      const url = serverUrlRef.current
      if (url) void pingServerRef.current(url)
      const stuck = assetsRef.current.filter((asset) => asset.status === 'converting')
      for (const asset of stuck) void runConvertRef.current(asset)
    })
    return () => sub.remove()
  }, [])

  const shareOutput = async (asset: VideoAsset) => {
    if (!asset.outputUri) return
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(asset.outputUri, { mimeType: 'video/mp4', dialogTitle: 'Share compressed video' })
    }
  }

  const convertAll = () => {
    const eligible = assets.filter((asset) => asset.status === 'ready' || asset.status === 'failed' || asset.status === 'cancelled')
    void eligible.reduce((chain, asset) => chain.then(() => runConvert(asset)), Promise.resolve())
  }

  const setProfileOn = (id: string, name: string, codec: Codec, crf: Crf) => {
    updateAsset(id, { profile: { codec, crf }, status: 'ready', progress: 0, outputUri: undefined, outputSize: undefined, error: undefined })
    void (async () => {
      const existing = await findExistingCompressed(name, codec, crf)
      if (!existing) return
      setAssets((current) => current.map((item) =>
        item.id === id && item.profile.codec === codec && item.profile.crf === crf
          ? { ...item, status: 'completed', progress: 100, outputUri: existing.outputUri, outputSize: existing.outputSize }
          : item))
    })()
  }

  const canStart = assets.some((asset) => ['ready', 'failed', 'cancelled'].includes(asset.status))
  const completed = assets.filter((asset) => asset.status === 'completed').length

  return { globalProfile, setGlobalProfile, assets, busy, preview, setPreview, importVideos, runConvert, shareOutput, convertAll, setProfileOn, canStart, completed }
}