import type { Codec, Crf, Profile } from '../../shared/domain'

type Props = {
  videoCount: number
  profile: Profile
  onCodec: (codec: Codec) => void
  onCrf: (crf: Crf) => void
  onApply: () => void
}

// Global codec/quality segmented controls + Apply-to-all.
export default function ControlBar({ videoCount, profile, onCodec, onCrf, onApply }: Props) {
  return (
    <section className="control-bar" aria-label="Compression controls">
      <div className="folder-summary"><span className="folder-icon">⌁</span><div><span className="label">WORKSPACE</span><strong>{videoCount ? `${videoCount} videos loaded` : 'No folder selected'}</strong></div></div>
      <div className="profile-controls">
        <div className="profile-group"><span className="label">CODEC</span><div className="segmented">{(['h265', 'h264'] as Codec[]).map((codec) => <button key={codec} onClick={() => onCodec(codec)} className={profile.codec === codec ? 'selected' : ''}>{codec === 'h265' ? 'H.265 / HEVC' : 'H.264'}</button>)}</div></div>
        <div className="profile-group"><span className="label">QUALITY</span><div className="segmented">{([25, 28] as Crf[]).map((crf) => <button key={crf} onClick={() => onCrf(crf)} className={profile.crf === crf ? 'selected' : ''}>CRF {crf}</button>)}</div></div>
      </div>
      <button className="apply-button" onClick={onApply} disabled={!videoCount}>Apply to all</button>
    </section>
  )
}