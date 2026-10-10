import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme'

type Option<T> = { value: T; label: string }

type Props<T> = {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  // Compact variant for the per-card pickers.
  size?: 'regular' | 'compact'
  disabled?: boolean
}

// Pill selector for a handful of mutually exclusive options.
export default function SegmentedControl<T extends string | number>({ options, value, onChange, size = 'regular', disabled = false }: Props<T>) {
  const compact = size === 'compact'
  return (
    <View style={[styles.track, disabled && styles.disabled]}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={String(option.value)}
            style={[styles.segment, compact && styles.segmentCompact, selected && styles.segmentSelected]}
            disabled={disabled || selected}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
          >
            <Text style={[compact ? styles.labelCompact : styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.elevated, borderRadius: radius.md, padding: 3 },
  disabled: { opacity: 0.5 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  segmentCompact: { paddingVertical: spacing.xxs },
  segmentSelected: { backgroundColor: colors.primarySoft },
  label: { ...typography.captionEmphasis, color: colors.textMuted },
  labelCompact: { ...typography.micro, color: colors.textMuted },
  labelSelected: { color: colors.text },
})
