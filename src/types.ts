import type { Profile } from '../shared/domain'

export type JobStatus = 'ready' | 'queued' | 'converting' | 'completed' | 'failed' | 'cancelled'

export type BrowserFileHandle = { kind: 'file'; getFile: () => Promise<File> }

export type BrowserDirectoryHandle = {
  values: () => AsyncIterable<BrowserFileHandle | { kind: string }>
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

export type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<BrowserDirectoryHandle> }

export type VideoAsset = {
  id: string
  file: File
  sourceHandle?: BrowserFileHandle
  name: string
  size: number
  url: string
  duration?: number
  width?: number
  height?: number
  resolution?: string
  profile: Profile
  progress: number
  status: JobStatus
  outputUrl?: string
  outputName?: string
  outputSize?: number
  error?: string
}

export type PreviewSelection = { video: VideoAsset; version: 'original' | 'compressed' }

export type EngineState = 'idle' | 'loading' | 'ready' | 'error'