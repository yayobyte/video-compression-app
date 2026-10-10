import * as DocumentPicker from 'expo-document-picker'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import { compressVideo, isOnDeviceAvailable } from '../compressor'
import { DEFAULT_PROFILE, sameProfile } from '../domain'
import type { Profile } from '../domain'
import { deleteSourceFile, findExistingCompressed } from '../storage'
import type { VideoAsset } from '../types'

// Owns the video library state for the home screen: assets, global profile,
// busy/preview UI state, and all the side-effect handlers (import, convert,
// cancel, share, save to gallery, per-card profile, foreground resume).
const ALBUM_NAME = 'Clippress'

export default function useAssets() {
  const [globalProfile, setGlobalProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [busy, setBusyState] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  // `busyRef` mirrors `busy` so the foreground-recovery path can release the
  // latch synchronously when a job is cancelled or superseded (the async state
  // update alone would not land before `runConvert` re-checked the guard).
  const busyRef = useRef(busy)
  const setBusy = (value: boolean) => {
    busyRef.current = value
    setBusyState(value)
  }

  const assetsRef = useRef(assets)
  assetsRef.current = assets

  // Per-card generation counter: cancelling or re-running bumps it, so a
  // promise from the stale attempt sees itself superseded and can never write
  // state over the newer one.
  const generation = useRef(new Map<string, number>())
  // The native cancel for the running job, and whether the app went to the
  // background while it ran. iOS stops the hardware encoder in the background,
  // so a job that fails after that is re-run on foreground instead of being
  // marked failed.
  const cancelOnDevice = useRef<(() => void) | null>(null)
  const backgroundedDuringDevice = useRef(false)
  const resumeQueue = useRef<string[]>([])

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
      const existing = await findExistingCompressed(asset.name, asset.profile)
      if (existing) {
        updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: existing.outputUri, outputSize: existing.outputSize })
      }
    }
  }

  const runConvert = async (asset: VideoAsset) => {
    if (busyRef.current) return
    if (!isOnDeviceAvailable()) {
      updateAsset(asset.id, { status: 'failed', progress: 0, error: 'Compression needs a dev or Release build of the app (it is not available in Expo Go).' })
      return
    }
    setBusy(true)
    backgroundedDuringDevice.current = false
    const gen = (generation.current.get(asset.id) ?? 0) + 1
    generation.current.set(asset.id, gen)
    const superseded = () => generation.current.get(asset.id) !== gen
    updateAsset(asset.id, { status: 'converting', progress: 0, error: undefined })
    try {
      const result = await compressVideo({
        fileUri: asset.uri,
        fileName: asset.name,
        profile: asset.profile,
        onProgress: (percent) => { if (!superseded()) updateAsset(asset.id, { progress: percent }) },
        registerCancel: (cancel) => { cancelOnDevice.current = cancel },
      })
      if (superseded()) return
      updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: result.outputUri, outputSize: result.outputSize, error: undefined })
    } catch (error) {
      if (superseded()) return
      if (backgroundedDuringDevice.current) {
        updateAsset(asset.id, { status: 'ready', progress: 0, error: undefined })
        resumeQueue.current.push(asset.id)
        return
      }
      updateAsset(asset.id, { status: 'failed', progress: 0, error: error instanceof Error ? error.message : String(error) })
    } finally {
      cancelOnDevice.current = null
      if (!superseded()) setBusy(false)
    }
  }

  const cancelConvert = (asset: VideoAsset) => {
    if (asset.status !== 'converting' || !cancelOnDevice.current) return
    cancelOnDevice.current()
    generation.current.set(asset.id, (generation.current.get(asset.id) ?? 0) + 1)
    cancelOnDevice.current = null
    setBusy(false)
    updateAsset(asset.id, { status: 'cancelled', progress: 0 })
  }

  const runConvertRef = useRef(runConvert)
  runConvertRef.current = runConvert

  // Back in the foreground: re-run, one after another, the jobs iOS interrupted
  // while the app was in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && cancelOnDevice.current) backgroundedDuringDevice.current = true
      if (state !== 'active') return
      const queued = resumeQueue.current
      resumeQueue.current = []
      void assetsRef.current
        .filter((asset) => queued.includes(asset.id))
        .reduce((chain, asset) => chain.then(() => runConvertRef.current(asset)), Promise.resolve())
    })
    return () => sub.remove()
  }, [])

  const shareOutput = async (asset: VideoAsset) => {
    if (!asset.outputUri) return
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(asset.outputUri, { mimeType: 'video/mp4', dialogTitle: 'Share compressed video' })
    }
  }

  // Copy the output into a "Clippress" album in Photos (iOS) / Gallery (Android).
  // The app's own clippress/ folder is private on Android, so this is how the
  // file becomes visible outside the app. Write-only access is enough.
  const saveToGallery = async (asset: VideoAsset) => {
    if (!asset.outputUri) return
    const place = Platform.OS === 'ios' ? 'Photos' : 'Gallery'
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['video'])
      if (!permission.granted) {
        Alert.alert('Permission needed', `Allow Clippress to save videos to ${place} in Settings.`)
        return
      }
      const album = await MediaLibrary.Album.get(ALBUM_NAME)
      // moveAssets=false keeps the app's own copy in clippress/ (Android moves by default).
      if (album) await MediaLibrary.Asset.create(asset.outputUri, album)
      else await MediaLibrary.Album.create(ALBUM_NAME, [asset.outputUri], false)
      Alert.alert(`Saved to ${place}`, `Find it in the ${ALBUM_NAME} album.`)
    } catch (error) {
      Alert.alert(`Couldn't save to ${place}`, error instanceof Error ? error.message : String(error))
    }
  }

  // Remove the imported source copy once its conversion is done, so the phone
  // keeps only the compressed output. The card stays in the list (still
  // shareable) but can no longer be re-converted. Confirmed first — destructive.
  const deleteOriginal = (asset: VideoAsset) => {
    if (asset.status !== 'completed' || asset.sourceDeleted || !asset.uri) return
    Alert.alert(
      'Delete original?',
      `This removes the source video from your phone and frees up space. The compressed copy stays in the list and can still be shared, but this video can no longer be re-converted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete original',
          style: 'destructive',
          onPress: () => {
            void deleteSourceFile(asset.uri).then(() => updateAsset(asset.id, { sourceDeleted: true }))
          },
        },
      ],
    )
  }

  const convertAll = () => {
    const eligible = assets.filter((asset) => asset.status === 'ready' || asset.status === 'failed' || asset.status === 'cancelled')
    void eligible.reduce((chain, asset) => chain.then(() => runConvert(asset)), Promise.resolve())
  }

  const setProfileOn = (id: string, name: string, profile: Profile) => {
    updateAsset(id, { profile, status: 'ready', progress: 0, outputUri: undefined, outputSize: undefined, error: undefined })
    void (async () => {
      const existing = await findExistingCompressed(name, profile)
      if (!existing) return
      setAssets((current) => current.map((item) =>
        item.id === id && sameProfile(item.profile, profile)
          ? { ...item, status: 'completed', progress: 100, outputUri: existing.outputUri, outputSize: existing.outputSize }
          : item))
    })()
  }

  const canStart = assets.some((asset) => ['ready', 'failed', 'cancelled'].includes(asset.status))
  const completed = assets.filter((asset) => asset.status === 'completed').length

  return { globalProfile, setGlobalProfile, assets, setAssets, busy, preview, setPreview, importVideos, runConvert, cancelConvert, shareOutput, saveToGallery, deleteOriginal, convertAll, setProfileOn, canStart, completed }
}