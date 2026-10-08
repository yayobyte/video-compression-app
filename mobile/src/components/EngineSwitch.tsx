import { StyleSheet, Switch, Text, View } from 'react-native'
import type { Engine } from '../compressionService'
import { colors, spacing, typography } from '../theme'

type Props = {
  engine: Engine
  deviceAvailable: boolean
  onChange: (engine: Engine) => void
}

// Server ⇄ On device switch. On device needs a dev or Release build.
export default function EngineSwitch({ engine, deviceAvailable, onChange }: Props) {
  const detail = !deviceAvailable
    ? 'Needs a dev or Release build'
    : engine === 'device'
      ? 'Phone hardware encoder · H.264'
      : 'Mac compression service'
  return (
    <>
      <Text style={styles.label}>ENGINE</Text>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.switchLabel}>On device</Text>
          <Text style={styles.switchValue}>{detail}</Text>
        </View>
        <Switch
          value={engine === 'device'}
          disabled={!deviceAvailable}
          onValueChange={(enabled) => onChange(enabled ? 'device' : 'server')}
          trackColor={{ true: colors.primarySoft, false: colors.elevated }}
          thumbColor={colors.text}
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xxs },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchLabel: { ...typography.bodyEmphasis, color: colors.text },
  switchValue: { ...typography.caption, color: colors.textMuted },
})
