export default function FooterNote({ completed }: { completed: number }) {
  return (
    <footer className="footer-note"><span className="dot" /> {completed} completed · Browser conversion uses FFmpeg/WASM and may be slow for large 4K files.</footer>
  )
}