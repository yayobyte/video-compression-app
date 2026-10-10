import type { VideoAsset } from '../types'

// UI helpers for status + compression readouts shared by screens/cards.

export const ratioText = (asset: VideoAsset) => {
  if (!asset.outputSize || asset.outputSize <= 0 || asset.size <= 0) return ''
  const times = asset.size / asset.outputSize
  if (times < 1) return 'larger than the original'
  return `Saved ${Math.round((1 - asset.outputSize / asset.size) * 100)}%`
}