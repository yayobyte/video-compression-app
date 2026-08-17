import type { VideoAsset } from '../types'

// Probe a video element for duration/resolution and stash the metadata on the
// asset. Creates a detached <video>, reads metadata once, then releases it.
export const inspectVideo = (asset: VideoAsset, update: (id: string, update: Partial<VideoAsset>) => void) => {
  const element = document.createElement('video')
  element.preload = 'metadata'
  element.src = asset.url
  element.onloadedmetadata = () => {
    update(asset.id, { duration: element.duration, width: element.videoWidth, height: element.videoHeight, resolution: `${element.videoWidth} × ${element.videoHeight}` })
    element.removeAttribute('src')
    element.load()
  }
}