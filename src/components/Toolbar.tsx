import type { ChangeEvent } from 'react'
import type { EngineState } from '../types'

type Props = {
  videoCount: number
  canStart: boolean
  engineState: EngineState
  fileInputRef: React.RefObject<HTMLInputElement | null>
  folderInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onChooseFolder: () => void
  onStartBatch: () => void
}

export default function Toolbar({ videoCount, canStart, engineState, fileInputRef, folderInputRef, onFileChange, onChooseFolder, onStartBatch }: Props) {
  return (
    <section className="toolbar">
      <div><span className="count">{videoCount}</span> <span className="muted">videos in this workspace</span></div>
      <div className="toolbar-actions">
        <input ref={folderInputRef} className="visually-hidden" type="file" multiple {...({ webkitdirectory: '' } as Record<string, string>)} onChange={onFileChange} />
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*" multiple onChange={onFileChange} />
        <button className="button-secondary" onClick={onChooseFolder}>Choose folder</button>
        <button className="button-secondary" onClick={() => fileInputRef.current?.click()}>Add files</button>
        <button className="button-primary" disabled={!canStart || engineState === 'loading'} onClick={onStartBatch}><span>↻</span> Convert batch</button>
      </div>
    </section>
  )
}