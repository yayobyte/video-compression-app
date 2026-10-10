import type { Profile } from './domain'

export type JobStatus = 'ready' | 'converting' | 'completed' | 'failed' | 'cancelled'

export type VideoAsset = {
  id: string
  name: string
  size: number
  uri: string
  profile: Profile
  status: JobStatus
  progress: number
  outputUri?: string
  outputSize?: number
  error?: string
  sourceDeleted?: boolean
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  ready: 'Ready',
  converting: 'Converting',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const STATUS_STYLE = {
  ready: 'status_ready',
  converting: 'status_converting',
  completed: 'status_completed',
  failed: 'status_failed',
  cancelled: 'status_cancelled',
} as const satisfies Record<JobStatus, string>
