import type { BrowserDirectoryHandle, BrowserFileHandle } from '../types'

export const MAX_ENCODE_PIXELS = 1080 * 2400

export const extensionFrom = (name: string) => name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'mp4'

export const formatDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return 'Reading…'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export const isCompleteMp4 = (data: Uint8Array) => {
  if (data.length < 8) return false
  const text = new TextDecoder().decode(data)
  return text.slice(0, 64).includes('ftyp') && /moov/.test(text)
}

// Chrome's File System Access API folder pick: enumerate top-level video files.
// Returns null when the API is unavailable (caller falls back to a <input>).
export const pickFolder = async (): Promise<{ handle: BrowserDirectoryHandle; files: File[]; handles: Map<string, BrowserFileHandle> } | null> => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) return null
  const handle = await picker()
  const files: File[] = []
  const handles = new Map<string, BrowserFileHandle>()
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    const fileHandle = entry as BrowserFileHandle
    const file = await fileHandle.getFile()
    if (!file.type.startsWith('video/')) continue
    files.push(file)
    handles.set(`${file.name}-${file.lastModified}-${file.size}`, fileHandle)
  }
  return { handle, files, handles }
}

type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<BrowserDirectoryHandle> }