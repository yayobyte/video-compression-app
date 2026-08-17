import { StyleSheet, Switch, Text, View } from 'react-native'
import type { Profile } from '../../../shared/domain'
import { colors, spacing, typography } from '../theme'

type Props = {
  profile: Profile
  onChange: (profile: Profile) => void
}

// Global codec + compression switches on the home screen.
export default function ProfileSwitches({ profile, onChange }: Props) {
  return (
    <>
      <Text style={styles.label}>PROFILE</Text>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.switchLabel}>Codec</Text>
          <Text style={styles.switchValue}>{profile.codec === 'h265' ? 'H.265 / HEVC' : 'H.264'}</Text>
        </View>
        <Switch
          value={profile.codec === 'h265'}
          onValueChange={(enabled) => onChange({ ...profile, codec: enabled ? 'h265' : 'h264' })}
          trackColor={{ true: colors.primarySoft, false: colors.elevated }}
          thumbColor={colors.text}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.switchLabel}>Compression</Text>
          <Text style={styles.switchValue}>CRF {profile.crf} · {profile.crf === 25 ? 'Higher quality' : 'Smaller file'}</Text>
        </View>
        <Switch
          value={profile.crf === 25}
          onValueChange={(highQuality) => onChange({ ...profile, crf: highQuality ? 25 : 28 })}
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