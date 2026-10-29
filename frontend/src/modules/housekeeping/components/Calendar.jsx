import { useState } from 'react'
import { api } from '../api.js'
import { useLoad } from '../useLoad.js'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Month calendar for picking a schedule date. Days with shifts get a dot.
export default function Calendar({ value, onChange, today }) {
  const [view, setView] = useState(() => {
    const [y, m] = value.split('-').map(Number)
    return { y, m: m - 1 }
  })
  const month = `${view.y}-${String(view.m + 1).padStart(2, '0')}`
  const days = useLoad(() => api.scheduleDays(month), [month])
  const busy = new Set((days.data?.days || []).map((d) => d.day))

  const first = new Date(view.y, view.m, 1).getDay()
  const count = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const move = (delta) => {
    const d = new Date(view.y, view.m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="hk-calendar">
      <div className="hk-calendar__head">
        <button type="button" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <strong>{new Date(view.y, view.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="hk-calendar__grid">
        {WEEKDAYS.map((w) => <span key={w} className="hk-calendar__dow">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />
          const key = iso(view.y, view.m, d)
          return (
            <button
              type="button"
              key={key}
              className={`hk-calendar__day${key === value ? ' is-selected' : ''}${key === today ? ' is-today' : ''}`}
              onClick={() => onChange(key)}
              aria-pressed={key === value}
              aria-label={`${key}${busy.has(key) ? ', has shifts' : ''}`}
            >
              {d}
              {busy.has(key) && <i aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
