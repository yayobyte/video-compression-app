import { formatBytes } from '../../shared/domain'
import type { Codec, Crf, Profile } from '../../shared/domain'
import type { VideoAsset } from '../types'
import { formatDuration } from '../utils/media'

type Props = {
  video: VideoAsset
  onPreview: (version: 'original' | 'compressed') => void
  onProfileChange: (patch: Partial<Profile>) => void
  onConvert: () => void
  onCancel: () => void
}

export default function VideoCard({ video, onPreview, onProfileChange, onConvert, onCancel }: Props) {
  const busy = video.status === 'converting' || video.status === 'queued'
  return (
    <article className="video-card">
      <button className="thumbnail" onClick={() => onPreview('original')} aria-label={`Preview ${video.name}`}><video src={video.url} muted preload="metadata" /><span className="play">▶</span><span className="duration">{formatDuration(video.duration)}</span></button>
      <div className="card-body">
        <div className="card-title"><h2 title={video.name}>{video.name}</h2><span className={`status ${video.status}`}>{video.status === 'ready' ? 'Ready' : video.status}</span></div>
        <div className="metadata"><span>{formatBytes(video.size)}</span><span>{video.resolution ?? 'Reading…'}</span><span>{video.file.type.replace('video/', '').toUpperCase() || 'VIDEO'}</span></div>
        <div className="card-profile">
          <div className="mini-segmented">{(['h265', 'h264'] as Codec[]).map((codec) => <button key={codec} disabled={busy} onClick={() => onProfileChange({ codec })} className={video.profile.codec === codec ? 'selected' : ''}>{codec.toUpperCase()}</button>)}</div>
          <div className="mini-segmented">{([25, 28] as Crf[]).map((crf) => <button key={crf} disabled={busy} onClick={() => onProfileChange({ crf })} className={video.profile.crf === crf ? 'selected' : ''}>{crf}</button>)}</div>
        </div>
        {busy && <div className="progress-wrap"><div className="progress-label"><span>{video.status === 'queued' ? 'Queued locally' : video.progress < 2 ? 'Preparing encoder' : 'Converting locally'}</span><span>{video.status === 'queued' ? 'Waiting' : `${video.progress}%`}</span></div><div className="progress"><span style={{ width: `${video.status === 'queued' ? 0 : video.progress}%` }} /></div></div>}
        {video.status === 'completed' && <div className="completed-row"><span>✓ {formatBytes(video.outputSize)} compressed</span><button onClick={() => onPreview('compressed')}>Open compressed</button></div>}
        {video.status === 'failed' && <p className="error-message">{video.error}</p>}
        <div className="card-actions"><button className="link-button" onClick={() => onPreview('original')}>Open original</button>{busy ? <button className="link-button danger" onClick={onCancel}>Cancel</button> : <button className="convert-button" onClick={onConvert}>{video.status === 'completed' ? 'Re-convert' : video.status === 'failed' ? 'Try again' : 'Convert'}</button>}</div>
      </div>
    </article>
  )
}