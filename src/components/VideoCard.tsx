import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { QUALITY_OPTIONS, RESOLUTION_OPTIONS, formatBytes } from '../domain'
import type { Profile } from '../domain'
import { colors, gaps, radius, spacing, surfaces, typography } from '../theme'
import type { VideoAsset } from '../types'
import { ratioText } from '../utils/status'
import CardPreview from './CardPreview'
import LinkAction from './LinkAction'
import SegmentedControl from './SegmentedControl'
import StatusBadge from './StatusBadge'

type Props = {
  asset: VideoAsset
  previewOpen: boolean
  onTogglePreview: () => void
  onConvert: () => void
  onCancel: () => void
  onShare: () => void
  onSaveToGallery: () => void
  onDeleteOriginal: () => void
  onSetProfile: (profile: Profile) => void
}

export default function VideoCard({ asset, previewOpen, onTogglePreview, onConvert, onCancel, onShare, onSaveToGallery, onDeleteOriginal, onSetProfile }: Props) {
  const converting = asset.status === 'converting'
  const completed = asset.status === 'completed'
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName} numberOfLines={1}>{asset.name}</Text>
        <StatusBadge status={asset.status} />
      </View>
      <Text style={styles.cardMeta}>{formatBytes(asset.size)}{asset.outputSize ? ` → ${formatBytes(asset.outputSize)}` : ''}</Text>
      {completed && asset.outputSize ? <Text style={styles.savedText}>{ratioText(asset)}</Text> : null}
      {asset.sourceDeleted ? (
        <Text style={styles.deletedHint}>Original deleted · compressed copy kept</Text>
      ) : (
        <View style={styles.cardProfileRow}>
          <View style={styles.cardProfileColumn}>
            <Text style={styles.cardProfileLabel}>Quality</Text>
            <SegmentedControl
              size="compact"
              options={QUALITY_OPTIONS}
              value={asset.profile.quality}
              disabled={converting}
              onChange={(quality) => onSetProfile({ ...asset.profile, quality })}
            />
          </View>
          <View style={styles.cardProfileColumn}>
            <Text style={styles.cardProfileLabel}>Max resolution</Text>
            <SegmentedControl
              size="compact"
              options={RESOLUTION_OPTIONS}
              value={asset.profile.maxResolution}
              disabled={converting}
              onChange={(maxResolution) => onSetProfile({ ...asset.profile, maxResolution })}
            />
          </View>
        </View>
      )}
      {converting && (
        <View style={styles.progress}>
          <Text style={styles.progressLabel}>Compressing on this phone… {asset.progress}%</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(asset.progress, 2)}%` }]} /></View>
        </View>
      )}
      {asset.status === 'failed' && asset.error ? <Text style={styles.errorText}>{asset.error}</Text> : null}
      <View style={styles.cardActions}>
        <LinkAction icon={previewOpen ? 'close-outline' : 'play-outline'} label={previewOpen ? 'Close preview' : 'Preview'} onPress={onTogglePreview} />
        {converting
          ? <>
              <ActivityIndicator size="small" color={colors.primarySoft} />
              <LinkAction icon="close-circle-outline" label="Cancel" onPress={onCancel} />
            </>
          : completed
            ? <>
                {!asset.sourceDeleted && <LinkAction icon="trash-outline" label="Delete original" onPress={onDeleteOriginal} />}
                {!asset.sourceDeleted && <LinkAction icon="refresh-outline" label="Re-convert" onPress={onConvert} />}
                <LinkAction icon="download-outline" label="Save to gallery" onPress={onSaveToGallery} />
                <LinkAction icon="share-outline" label="Share" onPress={onShare} />
              </>
            : <LinkAction icon={asset.status === 'failed' ? 'refresh' : 'play'} label={asset.status === 'failed' ? 'Try again' : 'Convert'} onPress={onConvert} />}
      </View>
      {previewOpen && <CardPreview uri={completed && asset.outputUri ? asset.outputUri : asset.uri} />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { ...surfaces.card, gap: gaps.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: gaps.sm },
  cardName: { ...typography.name, color: colors.text, flex: 1 },
  cardMeta: { ...typography.heading, color: colors.textMuted },
  savedText: { ...typography.captionEmphasis, color: colors.accent, marginBottom: spacing.xxs },
  deletedHint: { ...typography.captionEmphasis, color: colors.textMuted },
  cardProfileRow: { gap: gaps.sm },
  cardProfileColumn: { gap: gaps.xxs },
  cardProfileLabel: { ...typography.micro, color: colors.textMuted },
  progress: { gap: gaps.xxs },
  progressLabel: { ...typography.caption, color: colors.textMuted },
  progressTrack: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  errorText: { ...typography.caption, color: colors.danger, lineHeight: 17 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: gaps.sm, minHeight: 20 },
})