import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text } from 'react-native'
import { buttons, colors, gaps, typography } from '../theme'

export default function LinkAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.button} hitSlop={8}>
      <Ionicons name={icon} size={15} color={colors.accent} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { ...buttons.link, flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  label: { ...typography.link, color: colors.accent },
})