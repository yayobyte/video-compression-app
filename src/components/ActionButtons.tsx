import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { buttons, colors, gaps, radius, spacing, typography } from '../theme'

type Props = {
  canStart: boolean
  busy: boolean
  onImport: () => void
  onConvert: () => void
}

// Import videos + Convert action buttons under the controls card.
export default function ActionButtons({ canStart, busy, onImport, onConvert }: Props) {
  return (
    <View style={styles.row}>
      <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onImport}>
        <Ionicons name="folder-open-outline" size={16} color={colors.text} />
        <Text style={styles.buttonText}>Import videos</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.buttonPrimary]} disabled={!canStart || busy} onPress={onConvert}>
        <Ionicons name="flash-outline" size={16} color={colors.text} />
        <Text style={styles.buttonText}>Convert</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: gaps.md },
  button: { borderRadius: radius.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: gaps.sm },
  buttonSecondary: { ...buttons.secondary, flex: 1 },
  buttonPrimary: { ...buttons.primary, flex: 1 },
  buttonText: { ...typography.button, color: colors.text },
})