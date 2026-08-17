import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { ServerHealth } from '../compressionService'
import { buttons, colors, gaps, radius, spacing, surfaces, typography } from '../theme'
import { healthStatus } from '../utils/status'

type Props = {
  serverInput: string
  savingServer: boolean
  serverHealth: ServerHealth | null
  onChangeInput: (value: string) => void
  onApply: () => void
  onCheck: () => void
}

// Compression service address input + live health status row.
export default function ServerConfigCard({ serverInput, savingServer, serverHealth, onChangeInput, onApply, onCheck }: Props) {
  const status = healthStatus(serverHealth)
  return (
    <View style={styles.row}>
      <Text style={styles.label}>COMPRESSION SERVICE</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={serverInput}
          onChangeText={onChangeInput}
          placeholder="http://192.168.1.10:8787"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
        <Pressable style={[styles.apply, savingServer && styles.applyDisabled]} disabled={savingServer} onPress={onApply}>
          <Ionicons name="save-outline" size={15} color={colors.text} />
          <Text style={styles.applyText}>Apply</Text>
        </Pressable>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: status.dot }]} />
        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        <Pressable style={styles.check} onPress={onCheck}>
          <Ionicons name="pulse" size={14} color={colors.background} />
          <Text style={styles.checkText}>Check</Text>
        </Pressable>
      </View>
      {serverHealth && !serverHealth.ok && serverHealth.error ? <Text style={styles.error}>{serverHealth.error}</Text> : null}
      {!serverInput && <Text style={styles.hint}>Leave empty to auto-detect when running in Expo Go.</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { gap: gaps.sm, marginTop: spacing.xxs },
  label: { ...typography.label, color: colors.textMuted },
  inputRow: { flexDirection: 'row', gap: gaps.sm },
  input: { ...surfaces.field, flex: 1, paddingVertical: spacing.md, color: colors.text, ...typography.input, textAlignVertical: 'center' },
  apply: { ...buttons.primary, paddingHorizontal: spacing.lg, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  applyDisabled: { opacity: 0.6 },
  applyText: { ...typography.button, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: gaps.sm, marginTop: spacing.sm },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.sm },
  statusText: { ...typography.bodyEmphasis, color: colors.text },
  error: { ...typography.caption, color: colors.textMuted, flexShrink: 1, marginTop: spacing.xxs },
  hint: { ...typography.caption, color: colors.textMuted },
  check: { ...buttons.pill, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: gaps.xxs },
  checkText: { ...typography.button, color: colors.background, fontSize: 13, lineHeight: 18 },
})