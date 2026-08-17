export default function EmptyState({ onChooseFolder }: { onChooseFolder: () => void }) {
  return (
    <section className="empty-state">
      <div className="empty-icon">▣</div>
      <h2>Your workspace is empty.</h2>
      <p>Choose a folder in Chrome or add a few files to start reviewing your videos.</p>
      <button className="button-primary" onClick={onChooseFolder}>Choose a video folder</button>
      <small>Files stay on this device. The encoder downloads once when you first convert.</small>
    </section>
  )
}