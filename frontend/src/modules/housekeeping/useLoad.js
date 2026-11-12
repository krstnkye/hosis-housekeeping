import { useCallback, useEffect, useRef, useState } from 'react'

// Pages refresh their data quietly every 30 seconds while the browser tab is
// visible, and again when the tab comes back into view, so two people working
// on the same list see each other's changes.
const REFRESH_MS = 30000

// Loads data from the API. It loads again when a value in `deps` changes
// or when reload() is called; the previous data stays visible meanwhile.
// Pass { refresh: false } to turn the quiet refresh off (e.g. for lookups).
export function useLoad(loader, deps, { refresh = true } = {}) {
  const loaderRef = useRef(loader)
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ data: null, error: null, key: null })
  const key = `${JSON.stringify(deps)}#${version}`
  const keyRef = useRef(key)

  useEffect(() => {
    loaderRef.current = loader
    keyRef.current = key
  })

  useEffect(() => {
    let active = true
    loaderRef.current()
      .then((data) => active && setState({ data, error: null, key }))
      .catch((error) => active && setState({ data: null, error, key }))
    return () => {
      active = false
    }
  }, [key])

  useEffect(() => {
    if (!refresh) return undefined
    let busy = false
    const quiet = () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      const forKey = keyRef.current
      loaderRef
        .current()
        // Keep the data on screen if a quiet refresh fails; the next one retries.
        .then((data) => setState((s) => (s.key === forKey && keyRef.current === forKey ? { data, error: null, key: forKey } : s)))
        .catch(() => {})
        .finally(() => {
          busy = false
        })
    }
    const timer = setInterval(quiet, REFRESH_MS)
    document.addEventListener('visibilitychange', quiet)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', quiet)
    }
  }, [refresh])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data: state.data, error: state.error, loading: state.key !== key, reload }
}
