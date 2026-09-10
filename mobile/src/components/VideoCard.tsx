import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native'
import { formatBytes } from '../../../shared/domain'
import type { Codec, Crf } from '../../../shared/domain'
import { colors, gaps, spacing, surfaces, typography } from '../theme'
import type { VideoAsset } from '../types'
import { ratioText } from '../utils/status'
import CardPreview from './CardPreview'
import ConversionJourney from './ConversionJourney'
import LinkAction from './LinkAction'
import StatusBadge from './StatusBadge'

type Props = {
  asset: VideoAsset
  previewOpen: boolean
  onTogglePreview: () => void
  onConvert: () => void
  onShare: () => void
  onDeleteOriginal: () => void
  onSetProfile: (codec: Codec, crf: Crf) => void
}

export default function VideoCard({ asset, previewOpen, onTogglePreview, onConvert, onShare, onDeleteOriginal, onSetProfile }: Props) {
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
            <Text style={styles.cardProfileLabel}>Codec</Text>
            <Switch
              value={asset.profile.codec === 'h265'}
              onValueChange={(enabled) => onSetProfile(enabled ? 'h265' : 'h264', asset.profile.crf)}
              trackColor={{ true: colors.primarySoft, false: colors.elevated }}
              thumbColor={colors.text}
            />
            <Text style={styles.cardProfileHint}>{asset.profile.codec === 'h265' ? 'H.265/HEVC: much smaller files, not on older devices.' : 'H.264: plays everywhere, but larger files.'}</Text>
          </View>
          <View style={styles.cardProfileColumn}>
            <Text style={styles.cardProfileLabel}>Compression</Text>
            <Switch
              value={asset.profile.crf === 25}
              onValueChange={(highQuality) => onSetProfile(asset.profile.codec, highQuality ? 25 : 28)}
              trackColor={{ true: colors.primarySoft, false: colors.elevated }}
              thumbColor={colors.text}
            />
            <Text style={styles.cardProfileHint}>CRF {asset.profile.crf} · {asset.profile.crf === 25 ? 'Higher quality.' : 'Smaller file.'}</Text>
          </View>
        </View>
      )}
      {converting && asset.phase && <ConversionJourney phase={asset.phase} progress={asset.progress} />}
      {asset.status === 'failed' && asset.error ? <Text style={styles.errorText}>{asset.error}</Text> : null}
      <View style={styles.cardActions}>
        <LinkAction icon={previewOpen ? 'close-outline' : 'play-outline'} label={previewOpen ? 'Close preview' : 'Preview'} onPress={onTogglePreview} />
        {converting
          ? <ActivityIndicator size="small" color={colors.primarySoft} />
          : completed
            ? <>
                {!asset.sourceDeleted && <LinkAction icon="trash-outline" label="Delete original" onPress={onDeleteOriginal} />}
                {!asset.sourceDeleted && <LinkAction icon="refresh-outline" label="Re-convert" onPress={onConvert} />}
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
  cardProfileRow: { flexDirection: 'row', gap: gaps.md },
  cardProfileColumn: { flex: 1, gap: gaps.xxs, alignSelf: 'flex-start' },
  cardProfileLabel: { ...typography.micro, color: colors.textMuted },
  cardProfileHint: { ...typography.micro, color: colors.textDim, lineHeight: 13 },
  errorText: { ...typography.caption, color: colors.danger, lineHeight: 17 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: gaps.sm, minHeight: 20 },
})