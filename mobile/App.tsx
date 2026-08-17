import { StatusBar } from 'expo-status-bar'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { formatBytes } from '../shared/domain'
import type { Codec, Crf } from '../shared/domain'
import { checkServerHealth, compressVideo, findExistingCompressed, resolveServerUrl, saveServerUrl } from './src/compressionService'
import { buttons, colors, gaps, radius, spacing, surfaces, typography } from './src/theme'

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

const healthStatus = (health: { ok: boolean; error?: string } | null) => {
  if (health === null) return { label: 'Checking service…', color: colors.textMuted, dot: colors.textMuted }
  if (health.ok) return { label: 'Service online', color: colors.accent, dot: colors.online }
  return { label: 'Service offline', color: colors.danger, dot: colors.danger, error: health.error }
}

const ratioText = (asset: VideoAsset) => {
  if (!asset.outputSize || asset.outputSize <= 0 || asset.size <= 0) return ''
  const times = asset.size / asset.outputSize
  if (times < 1) return 'larger than the original'
  return `Saved ${Math.round((1 - asset.outputSize / asset.size) * 100)}%`
}

function CardPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false
    player.muted = false
  })
  return <VideoView player={player} style={styles.preview} contentFit="contain" nativeControls />
}

function LinkAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.linkButton} hitSlop={8}>
      <Ionicons name={icon} size={15} color={colors.accent} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  )
}

export default function App() {
  const [globalProfile, setGlobalProfile] = useState<{ codec: Codec; crf: Crf }>({ codec: 'h265', crf: 25 })
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [serverInput, setServerInput] = useState('')
  const [savingServer, setSavingServer] = useState(false)
  const [serverHealth, setServerHealth] = useState<{ ok: boolean; error?: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const pingServer = async (url: string) => {
    setServerHealth(null)
    setServerHealth(await checkServerHealth(url))
  }

  useEffect(() => {
    void (async () => {
      const url = await resolveServerUrl()
      setServerUrl(url)
      setServerInput(url)
      if (url) void pingServer(url)
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
      void pingServer(url)
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

  const runConvertRef = useRef(runConvert)
  runConvertRef.current = runConvert
  const serverUrlRef = useRef(serverUrl)
  serverUrlRef.current = serverUrl
  const pingServerRef = useRef(pingServer)
  pingServerRef.current = pingServer
  const assetsRef = useRef(assets)
  assetsRef.current = assets

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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View style={styles.brandRow}><Ionicons name="film-outline" size={18} color={colors.text} /><Text style={styles.brand}>clippress</Text></View>
          </View>

          <Text style={styles.title}>Make your video library <Text style={styles.titleAccent}>lighter.</Text></Text>

          <View style={styles.controlCard}>
            <Text style={styles.controlLabel}>PROFILE</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Codec</Text>
                <Text style={styles.switchValue}>{globalProfile.codec === 'h265' ? 'H.265 / HEVC' : 'H.264'}</Text>
              </View>
              <Switch
                value={globalProfile.codec === 'h265'}
                onValueChange={(enabled) => setGlobalProfile((profile) => ({ ...profile, codec: enabled ? 'h265' : 'h264' }))}
                trackColor={{ true: colors.primarySoft, false: colors.elevated }}
                thumbColor={colors.text}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Compression</Text>
                <Text style={styles.switchValue}>CRF {globalProfile.crf} · {globalProfile.crf === 25 ? 'Higher quality' : 'Smaller file'}</Text>
              </View>
              <Switch
                value={globalProfile.crf === 25}
                onValueChange={(highQuality) => setGlobalProfile((profile) => ({ ...profile, crf: highQuality ? 25 : 28 }))}
                trackColor={{ true: colors.primarySoft, false: colors.elevated }}
                thumbColor={colors.text}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.serverRow}>
              <Text style={styles.controlLabel}>COMPRESSION SERVICE</Text>
              <View style={styles.serverInputRow}>
                <TextInput
                  value={serverInput}
                  onChangeText={setServerInput}
                  placeholder="http://192.168.1.10:8787"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.serverInput}
                />
                <Pressable style={[styles.serverApply, savingServer && styles.serverApplyDisabled]} disabled={savingServer} onPress={applyServerUrl}>
                  <Ionicons name="save-outline" size={15} color={colors.text} />
                  <Text style={styles.serverApplyText}>Apply</Text>
                </Pressable>
              </View>
              <View style={styles.serverStatusRow}>
                <View style={[styles.serverStatusDot, { backgroundColor: healthStatus(serverHealth).dot }]} />
                <Text style={[styles.serverStatusText, { color: healthStatus(serverHealth).color }]}>{healthStatus(serverHealth).label}</Text>
                <Pressable style={styles.checkButton} onPress={() => void pingServer(serverUrl)}>
                  <Ionicons name="pulse" size={14} color={colors.background} />
                  <Text style={styles.checkButtonText}>Check</Text>
                </Pressable>
              </View>
              {serverHealth && !serverHealth.ok && serverHealth.error ? <Text style={styles.serverStatusError}>{serverHealth.error}</Text> : null}
              {!serverInput && <Text style={styles.controlHint}>Leave empty to auto-detect when running in Expo Go.</Text>}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void importVideos()}><Ionicons name="folder-open-outline" size={16} color={colors.text} /><Text style={styles.buttonText}>Import videos</Text></Pressable>
            <Pressable style={[styles.button, styles.buttonPrimary]} disabled={!canStart || busy} onPress={convertAll}><Ionicons name="flash-outline" size={16} color={colors.text} /><Text style={styles.buttonPrimaryText}>Convert</Text></Pressable>
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
                  <Text style={[styles.statusText, asset.status === 'completed' && styles.statusText_completed]}>{STATUS_LABEL[asset.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{formatBytes(asset.size)}{asset.outputSize ? ` → ${formatBytes(asset.outputSize)}` : ''}</Text>
              {asset.status === 'completed' && asset.outputSize ? <Text style={styles.savedText}>{ratioText(asset)}</Text> : null}
              <View style={styles.cardProfileRow}>
                <View style={styles.cardProfileColumn}>
                  <Text style={styles.cardProfileLabel}>Codec</Text>
                  <Switch
                    value={asset.profile.codec === 'h265'}
                    onValueChange={(enabled) => setProfileOn(asset.id, asset.name, enabled ? 'h265' : 'h264', asset.profile.crf)}
                    trackColor={{ true: colors.primarySoft, false: colors.elevated }}
                    thumbColor={colors.text}
                  />
                  <Text style={styles.cardProfileHint}>{asset.profile.codec === 'h265' ? 'H.265/HEVC: much smaller files, not on older devices.' : 'H.264: plays everywhere, but larger files.'}</Text>
                </View>
                <View style={styles.cardProfileColumn}>
                  <Text style={styles.cardProfileLabel}>Compression</Text>
                  <Switch
                    value={asset.profile.crf === 25}
                    onValueChange={(highQuality) => setProfileOn(asset.id, asset.name, asset.profile.codec, highQuality ? 25 : 28)}
                    trackColor={{ true: colors.primarySoft, false: colors.elevated }}
                    thumbColor={colors.text}
                  />
                  <Text style={styles.cardProfileHint}>CRF {asset.profile.crf} · {asset.profile.crf === 25 ? 'Higher quality.' : 'Smaller file.'}</Text>
                </View>
              </View>
              {(asset.status === 'converting') && (
                <View>
                  <Text style={styles.progressLabel}>{asset.phase === 'uploading' ? `Uploading… ${asset.progress}%` : `Compressing… ${asset.progress}%`}</Text>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(asset.progress, 2)}%` }]} /></View>
                </View>
              )}
              {asset.status === 'failed' && asset.error ? <Text style={styles.errorText}>{asset.error}</Text> : null}
              <View style={styles.cardActions}>
                <LinkAction icon={preview === asset.id ? 'close-outline' : 'play-outline'} label={preview === asset.id ? 'Close preview' : 'Preview'} onPress={() => setPreview((current) => current === asset.id ? null : asset.id)} />
                {asset.status !== 'converting'
                  ? <LinkAction icon={asset.status === 'failed' ? 'refresh' : asset.status === 'completed' ? 'refresh-outline' : 'play'} label={asset.status === 'failed' ? 'Try again' : asset.status === 'completed' ? 'Re-convert' : 'Convert'} onPress={() => void runConvert(asset)} />
                  : <ActivityIndicator size="small" color={colors.primarySoft} />}
                {asset.status === 'completed' && <LinkAction icon="share-outline" label="Share" onPress={() => void shareOutput(asset)} />}
              </View>
              {preview === asset.id && <CardPreview uri={asset.status === 'completed' && asset.outputUri ? asset.outputUri : asset.uri} />}
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
  scroll: { padding: spacing.xl, gap: gaps.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  brand: { ...typography.brand, color: colors.text },
  pill: { ...surfaces.pill },
  pillText: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.title, color: colors.text, marginTop: spacing.xxs },
  titleAccent: { color: colors.accent },
  controlCard: { ...surfaces.card, gap: gaps.sm },
  controlLabel: { ...typography.label, color: colors.textMuted },
  controlHint: { ...typography.caption, color: colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xxs },
  switchInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  switchLabel: { ...typography.bodyEmphasis, color: colors.text },
  switchValue: { ...typography.caption, color: colors.textMuted },
  divider: { ...surfaces.divider, marginVertical: spacing.xxs },
  serverRow: { gap: gaps.sm, marginTop: spacing.xxs },
  serverInputRow: { flexDirection: 'row', gap: gaps.sm },
  serverInput: { ...surfaces.field, flex: 1, paddingVertical: spacing.md, color: colors.text, ...typography.input, textAlignVertical: 'center' },
  serverApply: { ...buttons.primary, paddingHorizontal: spacing.lg, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  serverApplyDisabled: { opacity: 0.6 },
  serverApplyText: { ...typography.button, color: colors.text },
  serverStatusRow: { flexDirection: 'row', alignItems: 'center', gap: gaps.sm, marginTop: spacing.sm },
  serverStatusDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.sm },
  serverStatusText: { ...typography.bodyEmphasis, color: colors.text },
  serverStatusError: { ...typography.caption, color: colors.textMuted, flexShrink: 1, marginTop: spacing.xxs },
  checkButton: { ...buttons.pill, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: gaps.xxs },
  checkButtonText: { ...typography.button, color: colors.background, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: gaps.md },
  button: { borderRadius: radius.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: gaps.sm },
  buttonSecondary: { ...buttons.secondary, flex: 1 },
  buttonPrimary: { ...buttons.primary, flex: 1 },
  buttonText: { ...typography.button, color: colors.text },
  buttonPrimaryText: { ...typography.button, color: colors.text },
  empty: { ...surfaces.card, padding: spacing.xxl, alignItems: 'center', gap: gaps.sm },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  card: { ...surfaces.card, gap: gaps.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: gaps.sm },
  cardName: { ...typography.name, color: colors.text, flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: gaps.sm, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xxs },
  status_ready: { backgroundColor: colors.elevated },
  status_converting: { backgroundColor: colors.primarySoft },
  status_completed: { backgroundColor: colors.accent },
  status_failed: { backgroundColor: colors.dangerBg },
  status_cancelled: { backgroundColor: colors.elevated },
  statusText: { ...typography.micro, color: colors.text },
  statusText_completed: { color: colors.background },
  cardMeta: { ...typography.heading, color: colors.textMuted },
  savedText: { ...typography.captionEmphasis, color: colors.accent, marginBottom: spacing.xxs },
  cardProfileRow: { flexDirection: 'row', gap: gaps.md },
  cardProfileColumn: { flex: 1, gap: gaps.xxs, alignSelf: 'flex-start' },
  cardProfileLabel: { ...typography.micro, color: colors.textMuted },
  cardProfileHint: { ...typography.micro, color: colors.textDim, lineHeight: 13 },
  progressLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xxs },
  progressTrack: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  errorText: { ...typography.caption, color: colors.danger, lineHeight: 17 },
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.elevated },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },
  linkButton: { ...buttons.link, flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  linkText: { ...typography.link, color: colors.accent },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },
})