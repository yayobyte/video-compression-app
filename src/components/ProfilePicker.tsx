import { StyleSheet, Text, View } from 'react-native'
import { QUALITY_OPTIONS, RESOLUTION_OPTIONS } from '../domain'
import type { Profile } from '../domain'
import { colors, gaps, typography } from '../theme'
import SegmentedControl from './SegmentedControl'

type Props = {
  profile: Profile
  onChange: (profile: Profile) => void
}

// Default quality + max resolution for newly imported videos. Output is always
// H.264 MP4 (the phone's hardware encoder), so codec isn't a choice.
export default function ProfilePicker({ profile, onChange }: Props) {
  const qualityHint = QUALITY_OPTIONS.find((option) => option.value === profile.quality)?.hint
  const resolutionHint = RESOLUTION_OPTIONS.find((option) => option.value === profile.maxResolution)?.hint
  return (
    <>
      <Text style={styles.label}>PROFILE · H.264 MP4</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Quality</Text>
        <SegmentedControl options={QUALITY_OPTIONS} value={profile.quality} onChange={(quality) => onChange({ ...profile, quality })} />
        <Text style={styles.hint}>{qualityHint}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Max resolution</Text>
        <SegmentedControl options={RESOLUTION_OPTIONS} value={profile.maxResolution} onChange={(maxResolution) => onChange({ ...profile, maxResolution })} />
        <Text style={styles.hint}>{resolutionHint}</Text>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textMuted },
  row: { gap: gaps.xxs },
  rowLabel: { ...typography.bodyEmphasis, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted },
})
