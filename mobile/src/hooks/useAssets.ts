import * as DocumentPicker from 'expo-document-picker'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import type { Profile } from '../../../shared/domain'
import type { Codec, Crf } from '../../../shared/domain'
import { compressVideo, deleteSourceFile, findExistingCompressed } from '../compressionService'
import type { Engine, NetworkTask } from '../compressionService'
import { compressOnDevice } from '../onDeviceEngine'
import type { VideoAsset } from '../types'

// Owns the video library state for the home screen: assets, global profile,
// busy/preview UI state, and all the side-effect handlers (import, convert,
// share, per-card profile, foreground recovery).
const ALBUM_NAME = 'Clippress'

export default function useAssets(serverUrl: string, pingServer: (url: string) => void, engine: Engine) {
  const [globalProfile, setGlobalProfile] = useState<Profile>({ codec: 'h265', crf: 25 })
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [busy, setBusyState] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  // `busyRef` mirrors `busy` so the foreground-recovery path can release the
  // latch synchronously before re-running a conversion (the async state update
  // alone would not land before `runConvert` re-checked the guard).
  const busyRef = useRef(busy)
  const setBusy = (value: boolean) => {
    busyRef.current = value
    setBusyState(value)
  }

  const serverUrlRef = useRef(serverUrl)
  serverUrlRef.current = serverUrl
  const pingServerRef = useRef(pingServer)
  pingServerRef.current = pingServer
  const assetsRef = useRef(assets)
  assetsRef.current = assets

  // Per-card in-flight network task + a generation counter. A background/
  // foreground cycle kills the phone↔server task (iOS tears down the session),
  // so on resume we cancel the stale task and bump the generation: any promise
  // from the dead attempt then sees itself superseded and can never write state
  // over the fresh run.
  const inflightTasks = useRef(new Map<string, NetworkTask>())
  const generation = useRef(new Map<string, number>())
  // On-device jobs: the native cancel for the running job, and whether the app
  // went to the background while it ran. iOS stops the hardware encoder in the
  // background, so a job that fails after that is re-run on foreground instead
  // of being marked failed.
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
      const existing = await findExistingCompressed(asset.name, asset.profile.codec, asset.profile.crf)
      if (existing) {
        updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: existing.outputUri, outputSize: existing.outputSize })
      }
    }
  }

  const runConvertOnDevice = async (asset: VideoAsset) => {
    setBusy(true)
    backgroundedDuringDevice.current = false
    const gen = (generation.current.get(asset.id) ?? 0) + 1
    generation.current.set(asset.id, gen)
    const superseded = () => generation.current.get(asset.id) !== gen
    updateAsset(asset.id, { status: 'converting', progress: 0, phase: 'compressing', error: undefined })
    try {
      const result = await compressOnDevice({
        fileUri: asset.uri,
        fileName: asset.name,
        crf: asset.profile.crf,
        onProgress: (percent) => { if (!superseded()) updateAsset(asset.id, { progress: percent }) },
        registerCancel: (cancel) => { cancelOnDevice.current = cancel },
      })
      if (superseded()) return
      updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: result.outputUri, outputSize: result.outputSize, error: undefined })
    } catch (error) {
      if (superseded()) return
      if (backgroundedDuringDevice.current) {
        updateAsset(asset.id, { status: 'ready', progress: 0, phase: undefined, error: undefined })
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
    if (asset.status !== 'converting' || asset.phase !== 'compressing' || !cancelOnDevice.current) return
    cancelOnDevice.current()
    generation.current.set(asset.id, (generation.current.get(asset.id) ?? 0) + 1)
    cancelOnDevice.current = null
    setBusy(false)
    updateAsset(asset.id, { status: 'cancelled', progress: 0, phase: undefined })
  }

  const runConvert = async (asset: VideoAsset) => {
    if (busyRef.current) return
    if (engine === 'device') {
      await runConvertOnDevice(asset)
      return
    }
    if (!serverUrl) {
      updateAsset(asset.id, { status: 'failed', progress: 0, error: 'Set the compression service address first, then try again.' })
      return
    }
    setBusy(true)
    const gen = (generation.current.get(asset.id) ?? 0) + 1
    generation.current.set(asset.id, gen)
    const superseded = () => generation.current.get(asset.id) !== gen
    updateAsset(asset.id, { status: 'converting', progress: 0, phase: 'uploading', error: undefined })
    try {
      const result = await compressVideo({
        serverUrl,
        fileUri: asset.uri,
        fileName: asset.name,
        codec: asset.profile.codec,
        crf: asset.profile.crf,
        onProgress: (percent) => { if (!superseded()) updateAsset(asset.id, { progress: Math.max(0, percent) }) },
        onPhase: (phase) => { if (!superseded()) updateAsset(asset.id, { phase }) },
        registerTask: (task) => inflightTasks.current.set(asset.id, task),
        isCancelled: superseded,
      })
      if (superseded()) return
      updateAsset(asset.id, { status: 'completed', progress: 100, outputUri: result.outputUri, outputSize: result.outputSize, error: undefined })
    } catch (error) {
      if (superseded()) return
      const detail = error instanceof Error ? error.message : String(error)
      const offline = /network|failed to fetch|timed out|fetch|socket|connection|cancelled/i.test(detail)
      updateAsset(asset.id, {
        status: 'failed',
        progress: 0,
        error: offline
          ? `No connection to the compression service at ${serverUrl}. Start it with \`npm run server\` in the server/ folder, then try again.`
          : detail,
      })
    } finally {
      inflightTasks.current.delete(asset.id)
      if (!superseded()) setBusy(false)
    }
  }

  const runConvertRef = useRef(runConvert)
  runConvertRef.current = runConvert

  // When the app returns to the foreground, re-ping the service and recover any
  // card stuck mid-conversion. The upload and download legs of a conversion
  // run through the phone's network stack, which iOS suspends/kills, so those
  // attempts are unrecoverable in place: cancel the stale OS task, supersede
  // the dead promise, release the busy latch, and restart the conversion from
  // scratch. Cards that were in the `compressing` poll loop have no phone-side
  // task — the encode runs on the Mac and the poll loop just resumes on JS wake.
  useEffect(() => {
    const recover = async () => {
      const url = serverUrlRef.current
      if (url) void pingServerRef.current(url)

      // A background-session upload that genuinely reached the server resolves
      // right after resume. Wait a beat so finished work completes on its own
      // instead of being cancelled + re-uploaded: the deferred promise either
      // moves the card to `compressing`/`downloading`/`completed`, or leaves it
      // `converting` when the OS task really died and needs a restart below.
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // On-device jobs iOS interrupted in the background, one after another.
      const queued = resumeQueue.current
      resumeQueue.current = []
      void assetsRef.current
        .filter((asset) => queued.includes(asset.id))
        .reduce((chain, asset) => chain.then(() => runConvertRef.current(asset)), Promise.resolve())

      for (const asset of assetsRef.current.filter((a) => a.status === 'converting')) {
        if (asset.phase !== 'uploading' && asset.phase !== 'downloading') continue
        const task = inflightTasks.current.get(asset.id)
        if (task) void task.cancelAsync().catch(() => undefined)
        inflightTasks.current.delete(asset.id)
        generation.current.set(asset.id, (generation.current.get(asset.id) ?? 0) + 1)
        setBusy(false)
        void runConvertRef.current(asset)
      }
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && cancelOnDevice.current) backgroundedDuringDevice.current = true
      if (state !== 'active') return
      void recover()
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

  return { globalProfile, setGlobalProfile, assets, setAssets, busy, preview, setPreview, importVideos, runConvert, cancelConvert, shareOutput, saveToGallery, deleteOriginal, convertAll, setProfileOn, canStart, completed }
}