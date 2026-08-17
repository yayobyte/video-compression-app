import { colors } from '../theme'
import type { ServerHealth } from '../compressionService'
import type { VideoAsset } from '../types'

// UI helpers for status + compression readouts shared by screens/cards.

export type HealthView = { label: string; color: string; dot: string; error?: string }

export const healthStatus = (health: ServerHealth | null): HealthView => {
  if (health === null) return { label: 'Checking service…', color: colors.textMuted, dot: colors.textMuted }
  if (health.ok) return { label: 'Service online', color: colors.accent, dot: colors.online }
  return { label: 'Service offline', color: colors.danger, dot: colors.danger, error: health.error }
}

export const ratioText = (asset: VideoAsset) => {
  if (!asset.outputSize || asset.outputSize <= 0 || asset.size <= 0) return ''
  const times = asset.size / asset.outputSize
  if (times < 1) return 'larger than the original'
  return `Saved ${Math.round((1 - asset.outputSize / asset.size) * 100)}%`
}