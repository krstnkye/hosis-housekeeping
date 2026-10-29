import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { formatDateTime } from '../format.js'
import Icon from './Icon.jsx'

// Bell in the top bar listing what needs the user's attention.
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [seen, setSeen] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    let active = true
    const load = () => api.alerts().then((d) => active && setAlerts(d.alerts)).catch(() => {})
    load()
    const timer = setInterval(load, 30000)
    const onHash = () => load()
    window.addEventListener('hashchange', onHash)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const unread = Math.max(alerts.length - seen, 0)

  return (
    <div className="hk-bell" ref={ref}>
      <button
        type="button"
        className="hk-bell__btn"
        aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setSeen(alerts.length)
        }}
      >
        <Icon d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0" size={22} />
        {unread > 0 && <span className="hk-bell__count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="hk-bell__panel" role="dialog" aria-label="Notifications">
          <strong className="hk-bell__head">Notifications</strong>
          {alerts.length === 0 && <p className="hk-muted">You're all caught up.</p>}
          <ul>
            {alerts.map((a, i) => (
              <li key={`${a.type}-${i}`}>
                <a
                  href={`#/housekeeping/${a.page}`}
                  onClick={() => setOpen(false)}
                >
                  <span>{a.message}</span>
                  <small>{formatDateTime(a.at)}</small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
