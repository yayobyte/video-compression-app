import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, gaps, radius, spacing, typography } from '../theme'
import type { JourneyPhase } from '../types'

const JOURNEY_STEPS = [
  { key: 'uploading', label: 'Upload' },
  { key: 'compressing', label: 'Compress' },
  { key: 'downloading', label: 'Download' },
] as const

// The server conversion is a three-step journey: upload the source, compress on
// the server, download the result. Each step lights up as it completes. (A
// future on-device engine would only light the Compress step.)
export default function ConversionJourney({ phase, progress }: { phase: JourneyPhase; progress: number }) {
  const activeIndex = JOURNEY_STEPS.findIndex((step) => step.key === phase)
  return (
    <View style={styles.journey}>
      <View style={styles.journeySteps}>
        {JOURNEY_STEPS.map((step, index) => {
          const done = index < activeIndex || (activeIndex === 2 && progress >= 100)
          const active = index === activeIndex
          return (
            <View key={step.key} style={styles.journeyTrack}>
              {index > 0 && <View style={[styles.journeyConnector, done && styles.journeyConnectorDone]} />}
              <View style={styles.journeyStep}>
                <View style={[styles.journeyNode, done && styles.journeyNodeDone, active && styles.journeyNodeActive]}>
                  {done
                    ? <Ionicons name="checkmark" size={11} color={colors.background} />
                    : <Text style={[styles.journeyNum, active && styles.journeyNumActive]}>{index + 1}</Text>}
                </View>
                <Text style={[styles.journeyLabel, active && styles.journeyLabelActive, done && styles.journeyLabelDone]}>{step.label}</Text>
              </View>
            </View>
          )
        })}
      </View>
      <Text style={styles.progressLabel}>
        {phase === 'uploading' ? 'Uploading to the server…' : phase === 'downloading' ? 'Downloading result…' : 'Compressing on the server…'} {progress}%
      </Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(progress, 2)}%` }]} /></View>
    </View>
  )
}

const styles = StyleSheet.create({
  journey: { gap: gaps.sm },
  journeySteps: { flexDirection: 'row', alignItems: 'flex-start' },
  journeyTrack: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  journeyConnector: { width: spacing.xl, height: 2, backgroundColor: colors.textDim, opacity: 0.4, marginTop: 11 },
  journeyConnectorDone: { backgroundColor: colors.accent, opacity: 0.9 },
  journeyStep: { flex: 1, alignItems: 'center', gap: gaps.xxs },
  journeyNode: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  journeyNodeActive: { backgroundColor: colors.primarySoft },
  journeyNodeDone: { backgroundColor: colors.accent },
  journeyNum: { ...typography.micro, color: colors.textMuted, lineHeight: 14 },
  journeyNumActive: { color: colors.text },
  journeyLabel: { ...typography.micro, color: colors.textDim, lineHeight: 14 },
  journeyLabelActive: { color: colors.text },
  journeyLabelDone: { color: colors.accent },
  progressLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xxs },
  progressTrack: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
})