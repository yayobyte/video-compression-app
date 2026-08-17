import type { EngineState } from '../types'

export default function TopBar({ engineState }: { engineState: EngineState }) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Clippress home"><span className="brand-mark">◒</span> clippress</a>
      <div className="topbar-actions">
        <span className={`local-pill ${engineState}`}><span className="signal" /> {engineState === 'ready' ? 'Local encoder ready' : engineState === 'loading' ? 'Loading local encoder' : 'Local-only processing'}</span>
        <button className="avatar" aria-label="Account menu">Y</button>
      </div>
    </header>
  )
}