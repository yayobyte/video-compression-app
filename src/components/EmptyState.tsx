import { StyleSheet, Text, View } from 'react-native'
import { colors, gaps, spacing, surfaces, typography } from '../theme'

export default function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>No videos imported yet.</Text>
      <Text style={styles.body}>Import a few videos from your library to start reviewing them.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { ...surfaces.card, padding: spacing.xxl, alignItems: 'center', gap: gaps.sm },
  title: { ...typography.heading, color: colors.text },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
})