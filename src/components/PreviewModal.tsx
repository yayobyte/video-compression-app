import { formatBytes } from '../../shared/domain'
import type { PreviewSelection } from '../types'

type Props = {
  preview: PreviewSelection
  onClose: () => void
}

export default function PreviewModal({ preview, onClose }: Props) {
  const { video, version } = preview
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${video.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="label">{version === 'original' ? 'ORIGINAL VIDEO' : 'COMPRESSED VIDEO'}</span><h2>{version === 'compressed' ? video.outputName : video.name}</h2></div>
          <button className="close-button" onClick={onClose} aria-label="Close preview">×</button>
        </div>
        <video className="preview-video" controls autoPlay src={version === 'compressed' ? video.outputUrl : video.url} />
        <div className="modal-foot"><span>{version === 'compressed' ? formatBytes(video.outputSize) : formatBytes(video.size)} · {video.resolution ?? 'Video'}</span><span>{version === 'compressed' ? 'Generated locally in this browser.' : 'Your source file has not been changed.'}</span></div>
      </section>
    </div>
  )
}