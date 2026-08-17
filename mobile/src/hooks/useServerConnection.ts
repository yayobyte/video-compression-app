import { useEffect, useRef, useState } from 'react'
import { checkServerHealth, resolveServerUrl, saveServerUrl } from '../compressionService'
import type { ServerHealth } from '../compressionService'

// Owns the compression-service address + health-ping state for the home screen.
export default function useServerConnection() {
  const [serverUrl, setServerUrl] = useState('')
  const [serverInput, setServerInput] = useState('')
  const [savingServer, setSavingServer] = useState(false)
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null)
  const serverUrlRef = useRef(serverUrl)
  serverUrlRef.current = serverUrl

  const pingServer = async (url: string) => {
    setServerHealth(null)
    setServerHealth(await checkServerHealth(url))
  }

  useEffect(() => {
    void (async () => {
      const url = await resolveServerUrl()
      setServerUrl(url)
      setServerInput(url)
      if (url) void pingServer(url)
    })()
  }, [])

  const applyServerUrl = () => {
    const url = serverInput.trim().replace(/\/+$/, '')
    if (!url) return
    setSavingServer(true)
    void saveServerUrl(url).finally(() => {
      setServerUrl(url)
      setSavingServer(false)
      void pingServer(url)
    })
  }

  return { serverUrl, serverUrlRef, serverInput, setServerInput, savingServer, serverHealth, pingServer, applyServerUrl }
}