type Props = {
  notice: string
  onDismiss: () => void
}

export default function Notice({ notice, onDismiss }: Props) {
  return (
    <div className="notice" role="status"><span>✓</span>{notice}<button onClick={onDismiss} aria-label="Dismiss message">×</button></div>
  )
}