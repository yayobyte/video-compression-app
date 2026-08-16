export type Codec = 'h264' | 'h265'
export type Crf = 25 | 28

export type CompressionProfile = {
  id: string
  label: string
  codec: Codec
  crf: Crf
  preset: 'fast' | 'medium' | 'slow'
  audioBitrateKbps: number
  outputExtension: 'mp4'
}

export const PROFILES = {
  quality: {
    id: 'quality',
    label: 'Higher quality',
    codec: 'h265',
    crf: 25,
    preset: 'medium',
    audioBitrateKbps: 128,
    outputExtension: 'mp4',
  },
  compact: {
    id: 'compact',
    label: 'Smaller file',
    codec: 'h265',
    crf: 28,
    preset: 'medium',
    audioBitrateKbps: 128,
    outputExtension: 'mp4',
  },
} as const satisfies Record<string, CompressionProfile>

export const PROFILE_OPTIONS = Object.values(PROFILES)

export const outputNameFor = (name: string, codec: Codec, crf: Crf) =>
  `${name.replace(/\.[^.]+$/, '')}.compressed.${codec}.crf${crf}.mp4`

export const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}