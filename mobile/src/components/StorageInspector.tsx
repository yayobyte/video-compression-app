import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatBytes } from '../../../shared/domain'
import type { StorageRoot, StorageStats } from '../compressionService'
import { buttons, colors, gaps, radius, spacing, surfaces, typography } from '../theme'

type Props = {
  storage: StorageStats | null
  inspection: StorageRoot[]
  clearingStorage: boolean
  onClearStorage: () => void
}

const totalOnDisk = (inspection: StorageRoot[]) => inspection.reduce((sum, root) => sum + root.size, 0)

// Full-disk storage readout (matches iOS Settings) + Clear button. Kept
// separate from the empty state so it renders wherever the app wants to show
// how much space clippress is using.
export default function StorageInspector({ storage, inspection, clearingStorage, onClearStorage }: Props) {
  const total = totalOnDisk(inspection)
  const hasStored = storage !== null && (storage.outputs.count > 0 || storage.cache.count > 0)
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>STORAGE</Text>
        <Pressable style={[styles.clear, clearingStorage && styles.clearDisabled]} disabled={clearingStorage} onPress={onClearStorage}>
          <Ionicons name="trash-outline" size={14} color={colors.danger} />
          <Text style={styles.clearText}>{clearingStorage ? 'Clearing…' : 'Clear stored files'}</Text>
        </Pressable>
      </View>
      {hasStored ? <Text style={styles.appSummary}>
        {storage.outputs.count} output{storage.outputs.count === 1 ? '' : 's'} ({formatBytes(storage.outputs.bytes)}){storage.cache.count ? ` · ${storage.cache.count} cached (${formatBytes(storage.cache.bytes)})` : ''}
      </Text> : null}
      {inspection.length > 0 ? (
        <View style={styles.inspection}>
          {inspection.map((root) => (
            <View key={root.label} style={styles.row}>
              <Text style={styles.name}>{root.label}</Text>
              <Text style={styles.size}>{formatBytes(root.size)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.total}>Total on device</Text>
            <Text style={styles.total}>{formatBytes(total)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { ...surfaces.card, gap: gaps.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.label, color: colors.textMuted },
  clear: { ...buttons.link, flexDirection: 'row', alignItems: 'center', gap: gaps.xxs },
  clearDisabled: { opacity: 0.6 },
  clearText: { ...typography.link, color: colors.danger },
  appSummary: { ...typography.caption, color: colors.textMuted },
  inspection: { borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.elevated, gap: spacing.xxs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  size: { ...typography.captionEmphasis, color: colors.text },
  divider: { height: 1, backgroundColor: colors.textDim, opacity: 0.5, marginVertical: spacing.xxs },
  total: { ...typography.captionEmphasis, color: colors.text },
})