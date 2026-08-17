import { StyleSheet, Text } from 'react-native'
import { colors, spacing, typography } from '../theme'

export default function FooterNote({ completed }: { completed: number }) {
  return (
    <Text style={styles.footer}>
      Compression runs on your service ({completed} completed). Your videos travel to that server and back.
    </Text>
  )
}

const styles = StyleSheet.create({
  footer: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },
})