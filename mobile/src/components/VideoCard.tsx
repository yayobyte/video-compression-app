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
  onSetProfile: (codec: Codec, crf: Crf) => void
}

export default function VideoCard({ asset, previewOpen, onTogglePreview, onConvert, onShare, onSetProfile }: Props) {
  const converting = asset.status === 'converting'
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName} numberOfLines={1}>{asset.name}</Text>
        <StatusBadge status={asset.status} />
      </View>
      <Text style={styles.cardMeta}>{formatBytes(asset.size)}{asset.outputSize ? ` → ${formatBytes(asset.outputSize)}` : ''}</Text>
      {asset.status === 'completed' && asset.outputSize ? <Text style={styles.savedText}>{ratioText(asset)}</Text> : null}
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
      {converting && asset.phase && <ConversionJourney phase={asset.phase} progress={asset.progress} />}
      {asset.status === 'failed' && asset.error ? <Text style={styles.errorText}>{asset.error}</Text> : null}
      <View style={styles.cardActions}>
        <LinkAction icon={previewOpen ? 'close-outline' : 'play-outline'} label={previewOpen ? 'Close preview' : 'Preview'} onPress={onTogglePreview} />
        {converting
          ? <ActivityIndicator size="small" color={colors.primarySoft} />
          : <LinkAction icon={asset.status === 'failed' ? 'refresh' : asset.status === 'completed' ? 'refresh-outline' : 'play'} label={asset.status === 'failed' ? 'Try again' : asset.status === 'completed' ? 'Re-convert' : 'Convert'} onPress={onConvert} />}
        {asset.status === 'completed' && <LinkAction icon="share-outline" label="Share" onPress={onShare} />}
      </View>
      {previewOpen && <CardPreview uri={asset.status === 'completed' && asset.outputUri ? asset.outputUri : asset.uri} />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { ...surfaces.card, gap: gaps.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: gaps.sm },
  cardName: { ...typography.name, color: colors.text, flex: 1 },
  cardMeta: { ...typography.heading, color: colors.textMuted },
  savedText: { ...typography.captionEmphasis, color: colors.accent, marginBottom: spacing.xxs },
  cardProfileRow: { flexDirection: 'row', gap: gaps.md },
  cardProfileColumn: { flex: 1, gap: gaps.xxs, alignSelf: 'flex-start' },
  cardProfileLabel: { ...typography.micro, color: colors.textMuted },
  cardProfileHint: { ...typography.micro, color: colors.textDim, lineHeight: 13 },
  errorText: { ...typography.caption, color: colors.danger, lineHeight: 17 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },
})