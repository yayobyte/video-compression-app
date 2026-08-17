import type { ChangeEvent } from 'react'
import { saveSourceFile } from '../persistence'
import type { Profile } from '../../shared/domain'
import type { BrowserDirectoryHandle, BrowserFileHandle, VideoAsset } from '../types'
import { pickFolder } from '../utils/media'

type Options = {
  globalProfile: Profile
  directoryHandleRef: React.MutableRefObject<BrowserDirectoryHandle | null>
  folderInputRef: React.RefObject<HTMLInputElement | null>
  setVideos: React.Dispatch<React.SetStateAction<VideoAsset[]>>
  setNotice: React.Dispatch<React.SetStateAction<string | null>>
  inspect: (asset: VideoAsset) => void
}

// File/folder import: builds VideoAssets, persists sources, probes metadata.
export default function useImport({ globalProfile, directoryHandleRef, folderInputRef, setVideos, setNotice, inspect }: Options) {
  const addFiles = (files: File[], handles: Map<string, BrowserFileHandle> = new Map()) => {
    const assets = files.filter((file) => file.type.startsWith('video/')).map((file) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      file,
      sourceHandle: handles.get(`${file.name}-${file.lastModified}-${file.size}`),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      profile: globalProfile,
      progress: 0,
      status: 'ready' as const,
    }))
    setVideos((current) => [...current, ...assets.filter((asset) => !current.some((video) => video.id === asset.id))])
    assets.forEach((asset) => void saveSourceFile(asset.id, asset.file))
    assets.forEach(inspect)
    if (assets.length) setNotice(`${assets.length} video${assets.length === 1 ? '' : 's'} added locally.`)
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const chooseFolder = async () => {
    try {
      const picked = await pickFolder()
      if (!picked) {
        folderInputRef.current?.click()
        return
      }
      directoryHandleRef.current = picked.handle
      addFiles(picked.files, picked.handles)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setNotice('The folder could not be opened. You can still add individual files.')
    }
  }

  return { addFiles, onFileChange, chooseFolder }
}