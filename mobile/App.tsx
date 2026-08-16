import { StatusBar } from 'expo-status-bar'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { formatBytes } from '../shared/domain'
import type { Codec, Crf } from '../shared/domain'
import { compressVideo, findExistingCompressed, resolveServerUrl, saveServerUrl } from './src/compressionService'

type JobStatus = 'ready' | 'converting' | 'completed' | 'failed' | 'cancelled'

type VideoAsset = {
  id: string
  name: string
  size: number
  uri: string
  profile: { codec: Codec; crf: Crf }
  status: JobStatus
  progress: number
  phase?: 'uploading' | 'compressing'
  outputUri?: string
  outputSize?: number
  error?: string
}

const CODECS: Codec[] = ['h265', 'h264']
const CRFS: Crf[] = [25, 28]

const STATUS_LABEL: Record<JobStatus, string> = {
  ready: 'Ready',
  converting: 'Converting',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_STYLE = {
  ready: 'status_ready',
  converting: 'status_converting',
  completed: 'status_completed',
  failed: 'status_failed',
  cancelled: 'status_cancelled',
} as const

const colors = {
  background: '#121316',
  card: '#292b30',
  elevated: '#35373d',
  text: '#ffffff',
  muted: '#9b9da7',
  accent: '#a8ecd9',
  accentStrong: '#6f74ff',
  danger: '#ffabb2',
}

const ratioText = (asset: VideoAsset) => {
  if (!asset.outputSize || asset.outputSize <= 0 || asset.size <= 0) return ''
  const times = asset.size / asset.outputSize
  if (times < 1) return 'larger than the original'
  return `×${times.toFixed(1)} smaller · saved ${Math.round((1 - asset.outputSize / asset.size) * 100)}%`
}

function CardPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false
    player.muted = false
  })
  return <VideoView player={player} style={styles.preview} contentFit="contain" nativeControls />
}

export default function App() {
  const [globalProfile, setGlobalProfile] = useState<{ codec: Codec; crf: Crf }>({ codec: 'h265', crf: 25 })
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [serverInput, setServerInput] = useState('')
  const [savingServer, setSavingServer] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const url = await resolveServerUrl()
      setServerUrl(url)
      setServerInput(url)
    })()
  }, [])

  const updateAsset = (id: string, update: Partial<VideoAsset>) => {
    setAssets((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))
  }

  const applyServerUrl = () => {
    const url = serverInput.trim().replace(/\/+$/, '')
    if (!url) return
    setSavingServer(true)
    void saveServerUrl(url).finally(() => {
      setServerUrl(url)
      setSavingServer(false)
    })
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.brand}>◒ clippress</Text>
            <View style={styles.pill}><Text style={styles.pillText}>{assets.length ? `${assets.length} videos loaded` : 'Local-only processing'}</Text></View>
          </View>

          <Text style={styles.eyebrow}>VIDEO WORKSPACE • IPHONE</Text>
          <Text style={styles.title}>Make your video library <Text style={styles.titleAccent}>lighter.</Text></Text>
          <Text style={styles.subtitle}>Choose a profile, import videos, and convert through your compression service.</Text>

          <View style={styles.controlCard}>
            <Text style={styles.controlLabel}>PROFILE</Text>
            <Text style={styles.controlHint}>Applied to new imports and ready videos.</Text>
            <View style={styles.segmented}>
              {CODECS.map((codec) => (
                <Pressable key={codec} onPress={() => setGlobalProfile((profile) => ({ ...profile, codec }))} style={[styles.segment, globalProfile.codec === codec && styles.segmentSelected]}>
                  <Text style={[styles.segmentText, globalProfile.codec === codec && styles.segmentTextSelected]}>{codec === 'h265' ? 'H.265 / HEVC' : 'H.264'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.segmented}>
              {CRFS.map((crf) => (
                <Pressable key={crf} onPress={() => setGlobalProfile((profile) => ({ ...profile, crf }))} style={[styles.segment, globalProfile.crf === crf && styles.segmentSelected]}>
                  <Text style={[styles.segmentText, globalProfile.crf === crf && styles.segmentTextSelected]}>CRF {crf}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.serverRow}>
              <Text style={styles.controlLabel}>COMPRESSION SERVICE</Text>
              <View style={styles.serverInputRow}>
                <TextInput
                  value={serverInput}
                  onChangeText={setServerInput}
                  placeholder="http://192.168.1.10:8787"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.serverInput}
                />
                <Pressable style={[styles.serverApply, savingServer && styles.serverApplyDisabled]} disabled={savingServer} onPress={applyServerUrl}>
                  <Text style={styles.serverApplyText}>Apply</Text>
                </Pressable>
              </View>
              {!serverInput && <Text style={styles.controlHint}>Leave empty to auto-detect when running in Expo Go.</Text>}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void importVideos()}><Text style={styles.buttonText}>Import videos</Text></Pressable>
            <Pressable style={[styles.button, styles.buttonPrimary]} disabled={!canStart || busy} onPress={convertAll}><Text style={styles.buttonPrimaryText}>↻ Convert</Text></Pressable>
          </View>

          {!assets.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No videos imported yet.</Text>
              <Text style={styles.emptyBody}>Import a few videos from your library to start reviewing them.</Text>
            </View>
          ) : assets.map((asset) => (
            <View key={asset.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardName} numberOfLines={1}>{asset.name}</Text>
                <View style={[styles.statusBadge, styles[STATUS_STYLE[asset.status]]]}>
                  {asset.status === 'converting' && <ActivityIndicator size="small" color={colors.text} />}
                  <Text style={styles.statusText}>{STATUS_LABEL[asset.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{formatBytes(asset.size)}</Text>
              <View style={styles.miniSegmented}>
                {CODECS.map((codec) => (
                  <Pressable key={codec} onPress={() => setProfileOn(asset.id, asset.name, codec, asset.profile.crf)} style={[styles.miniSegment, asset.profile.codec === codec && styles.miniSegmentSelected]}>
                    <Text style={[styles.miniText, asset.profile.codec === codec && styles.miniTextSelected]}>{codec.toUpperCase()}</Text>
                  </Pressable>
                ))}
                {CRFS.map((crf) => (
                  <Pressable key={crf} onPress={() => setProfileOn(asset.id, asset.name, asset.profile.codec, crf)} style={[styles.miniSegment, asset.profile.crf === crf && styles.miniSegmentSelected]}>
                    <Text style={[styles.miniText, asset.profile.crf === crf && styles.miniTextSelected]}>{crf}</Text>
                  </Pressable>
                ))}
              </View>
              {(asset.status === 'converting') && (
                <View>
                  <Text style={styles.progressLabel}>{asset.phase === 'uploading' ? `Uploading… ${asset.progress}%` : `Compressing… ${asset.progress}%`}</Text>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(asset.progress, 2)}%` }]} /></View>
                </View>
              )}
              {asset.status === 'completed' && (
                <View style={styles.completedRow}>
                  <View>
                    <Text style={styles.completedText}>✓ {formatBytes(asset.outputSize)} compressed</Text>
                    <Text style={styles.ratioText}>{formatBytes(asset.size)} → {formatBytes(asset.outputSize ?? 0)} · {ratioText(asset)}</Text>
                  </View>
                  <Pressable onPress={() => void shareOutput(asset)} style={styles.linkButton}><Text style={styles.linkText}>Share</Text></Pressable>
                </View>
              )}
              {asset.status === 'failed' && asset.error ? <Text style={styles.errorText}>{asset.error}</Text> : null}
              {preview === asset.id && <CardPreview uri={asset.status === 'completed' && asset.outputUri ? asset.outputUri : asset.uri} />}
              <View style={styles.cardActions}>
                <Pressable onPress={() => setPreview((current) => current === asset.id ? null : asset.id)} style={styles.linkButton}><Text style={styles.linkText}>{preview === asset.id ? 'Close preview' : 'Preview'}</Text></Pressable>
                {asset.status !== 'converting'
                  ? <Pressable onPress={() => void runConvert(asset)} style={styles.linkButton}><Text style={styles.linkText}>{asset.status === 'failed' ? 'Try again' : asset.status === 'completed' ? 'Re-convert' : 'Convert'}</Text></Pressable>
                  : <ActivityIndicator size="small" color={colors.accentStrong} />}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>Compression runs on your service ({assets.filter((asset) => asset.status === 'completed').length} completed). Your videos travel to that server and back.</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: colors.text, fontWeight: '800', fontSize: 18 },
  pill: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: colors.muted, fontSize: 12 },
  eyebrow: { color: colors.muted, fontSize: 11, letterSpacing: 2, marginTop: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 6 },
  titleAccent: { color: colors.accent },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  controlCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 10 },
  controlLabel: { color: colors.muted, fontSize: 11, letterSpacing: 2 },
  controlHint: { color: colors.muted, fontSize: 12 },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, backgroundColor: colors.elevated, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.accentStrong },
  segmentText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  segmentTextSelected: { color: colors.text },
  serverRow: { gap: 8, marginTop: 6 },
  serverInputRow: { flexDirection: 'row', gap: 8 },
  serverInput: { flex: 1, backgroundColor: colors.elevated, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13 },
  serverApply: { backgroundColor: colors.accentStrong, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  serverApplyDisabled: { opacity: 0.6 },
  serverApplyText: { color: colors.text, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  button: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  buttonSecondary: { backgroundColor: colors.elevated, flex: 1 },
  buttonPrimary: { backgroundColor: colors.accentStrong, flex: 1 },
  buttonText: { color: colors.text, fontWeight: '700' },
  buttonPrimaryText: { color: colors.text, fontWeight: '800' },
  empty: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center', gap: 6 },
  emptyTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  emptyBody: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardName: { color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  status_ready: { backgroundColor: colors.elevated },
  status_converting: { backgroundColor: colors.accentStrong },
  status_completed: { backgroundColor: colors.accent },
  status_failed: { backgroundColor: '#6e2b30' },
  status_cancelled: { backgroundColor: colors.elevated },
  statusText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 13 },
  miniSegmented: { flexDirection: 'row', gap: 6 },
  miniSegment: { backgroundColor: colors.elevated, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  miniSegmentSelected: { borderWidth: 1, borderColor: colors.accentStrong },
  miniText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  miniTextSelected: { color: colors.accent },
  progressLabel: { color: colors.muted, fontSize: 11, marginBottom: 4 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accentStrong },
  completedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completedText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  ratioText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  preview: { width: '100%', height: 220, borderRadius: 10, backgroundColor: colors.elevated },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },
  linkButton: { paddingVertical: 4, paddingHorizontal: 2 },
  linkText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingTop: 8 },
})