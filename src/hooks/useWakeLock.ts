import { useEffect, useRef } from 'react'

// Screen wake lock kept during encodes; tried once, silently dropped if the
// browser doesn't support it.
export default function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const grab = async () => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
    if (typeof wakeLock?.request !== 'function') return
    try {
      wakeLockRef.current = await wakeLock.request('screen')
    } catch { /* wake lock unavailable, continue without it */ }
  }

  const release = () => {
    void wakeLockRef.current?.release()
    wakeLockRef.current = null
  }

  useEffect(() => () => release(), [])

  return { grab, release }
}