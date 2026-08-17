import { useEffect, useState } from 'react'
import { clearStoredFiles, getStorageStats, inspectStorage, logStorageState } from '../compressionService'
import type { StorageRoot, StorageStats } from '../compressionService'

// Storage usage + Clear-stored-files state for the empty-state banner. Also
// runs the full-disk inspection (all four sandbox roots) so the banner can show
// what iOS Settings actually reports, not just the folders the app tracks.
export default function useStorage() {
  const [storage, setStorage] = useState<StorageStats | null>(null)
  const [inspection, setInspection] = useState<StorageRoot[]>([])
  const [clearingStorage, setClearingStorage] = useState(false)

  useEffect(() => {
    void logStorageState()
    void refreshStorage()
  }, [])

  const refreshStorage = async () => {
    setStorage(await getStorageStats())
    setInspection(await inspectStorage())
  }

  const clearStorage = async () => {
    if (clearingStorage) return
    setClearingStorage(true)
    try {
      setStorage(await clearStoredFiles())
      setInspection(await inspectStorage())
    } finally {
      setClearingStorage(false)
    }
  }

  return { storage, inspection, clearingStorage, clearStorage }
}