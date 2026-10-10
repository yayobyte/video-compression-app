import { StyleSheet, Text } from 'react-native'
import { colors, spacing, typography } from '../theme'

export default function FooterNote({ completed }: { completed: number }) {
  return (
    <Text style={styles.footer}>
      Compression runs on this phone ({completed} completed). Your videos never leave it.
    </Text>
  )
}

const styles = StyleSheet.create({
  footer: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },
})