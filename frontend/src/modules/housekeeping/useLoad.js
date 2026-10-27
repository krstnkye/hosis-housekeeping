import { useCallback, useEffect, useRef, useState } from 'react'

// Loads data from the API. It loads again when a value in `deps` changes
// or when reload() is called; the previous data stays visible meanwhile.
export function useLoad(loader, deps) {
  const loaderRef = useRef(loader)
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ data: null, error: null, key: null })
  const key = `${JSON.stringify(deps)}#${version}`

  useEffect(() => {
    loaderRef.current = loader
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

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data: state.data, error: state.error, loading: state.key !== key, reload }
}
