import { useEffect, useState } from 'react'
import { resolveEngine, saveEngine } from '../compressionService'
import type { Engine } from '../compressionService'
import { isOnDeviceAvailable } from '../onDeviceEngine'

const DEVICE_AVAILABLE = isOnDeviceAvailable()

// Owns the Server ⇄ On device choice, persisted across launches.
export default function useEngine() {
  const [engine, setEngineState] = useState<Engine>('server')

  useEffect(() => {
    void resolveEngine(DEVICE_AVAILABLE).then(setEngineState)
  }, [])

  const setEngine = (next: Engine) => {
    setEngineState(next)
    void saveEngine(next)
  }

  return { engine, setEngine, deviceAvailable: DEVICE_AVAILABLE }
}
