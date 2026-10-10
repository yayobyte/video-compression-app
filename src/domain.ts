// The compression profile the user picks, globally and per card.
//
// react-native-compressor runs the phone's hardware H.264 encoder, which takes
// a bitrate and a maximum long edge (not a CRF). Quality picks the bits per
// pixel that set the bitrate; max resolution caps the long edge.
export type Quality = 'high' | 'balanced' | 'small'
export type MaxResolution = 'original' | 1080 | 720 | 480

export type Profile = { quality: Quality; maxResolution: MaxResolution }

export const DEFAULT_PROFILE: Profile = { quality: 'balanced', maxResolution: 'original' }

export const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: 'high', label: 'High', hint: 'Closest to the original · ≈5.6 Mbps at 1080p' },
  { value: 'balanced', label: 'Balanced', hint: 'Good quality, smaller file · ≈3.7 Mbps at 1080p' },
  { value: 'small', label: 'Small', hint: 'Smallest file · ≈2.5 Mbps at 1080p' },
]

export const RESOLUTION_OPTIONS: { value: MaxResolution; label: string; hint: string }[] = [
  { value: 'original', label: 'Original', hint: 'Keep the source resolution' },
  { value: 1080, label: '1080p', hint: 'Long edge up to 1920 px' },
  { value: 720, label: '720p', hint: 'Long edge up to 1280 px' },
  { value: 480, label: '480p', hint: 'Long edge up to 854 px' },
]

// Long edge in pixels for each resolution step (16:9 width at that height).
export const LONG_EDGE: Record<Exclude<MaxResolution, 'original'>, number> = { 1080: 1920, 720: 1280, 480: 854 }

const resolutionTag = (maxResolution: MaxResolution) => maxResolution === 'original' ? 'original' : `${maxResolution}p`

export const outputNameFor = (name: string, profile: Profile) =>
  `${name.replace(/\.[^.]+$/, '')}.compressed.${profile.quality}.${resolutionTag(profile.maxResolution)}.mp4`

export const sameProfile = (a: Profile, b: Profile) => a.quality === b.quality && a.maxResolution === b.maxResolution

export const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}
