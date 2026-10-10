import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme'
import { STATUS_LABEL, STATUS_STYLE } from '../types'
import type { JobStatus } from '../types'

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <View style={[styles.badge, styles[STATUS_STYLE[status]]]}>
      {status === 'converting' && <ActivityIndicator size="small" color={colors.text} />}
      <Text style={[styles.text, status === 'completed' && styles.textInverted]}>{STATUS_LABEL[status]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xxs },
  status_ready: { backgroundColor: colors.elevated },
  status_converting: { backgroundColor: colors.primarySoft },
  status_completed: { backgroundColor: colors.accent },
  status_failed: { backgroundColor: colors.dangerBg },
  status_cancelled: { backgroundColor: colors.elevated },
  text: { ...typography.micro, color: colors.text },
  textInverted: { color: colors.background },
})