import { useEffect, useRef, useState } from 'react'
import Calendar from './Calendar.jsx'
import { addDays, longDate, todayISO } from '../format.js'

// Date button that opens the month calendar in a pop-up (Figma "Calendar Picker Open").
export default function DatePicker({ value, onChange, disabled, format }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="hk-datepicker" ref={ref}>
      <button
        type="button"
        className="hk-datepicker__button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        {format ? format(value) : longDate(value)}
      </button>
      {open && (
        <div className="hk-datepicker__pop" role="dialog" aria-label="Pick a date">
          <Calendar
            value={value}
            today={todayISO()}
            onChange={(d) => {
              onChange(d)
              setOpen(false)
            }}
          />
          <p className="hk-datepicker__selected">Selected: {longDate(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      )}
    </div>
  )
}

// ‹ date › navigation used on the Schedules and My Schedule pages.
export function DateNav({ value, onChange, children }) {
  return (
    <div className="hk-datenav">
      <button type="button" className="hk-datenav__step" onClick={() => onChange(addDays(value, -1))} aria-label="Previous day">‹</button>
      <DatePicker value={value} onChange={onChange} />
      <button type="button" className="hk-datenav__step" onClick={() => onChange(addDays(value, 1))} aria-label="Next day">›</button>
      {children}
    </div>
  )
}

