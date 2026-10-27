import { label, tone } from '../format.js'

export function Badge({ value, children }) {
  return <span className={`hk-badge hk-badge--${tone(value)}`}>{children ?? label(value)}</span>
}

export function Card({ title, subtitle, actions, className = '', children }) {
  return (
    <section className={`hk-card ${className}`}>
      {(title || actions) && (
        <header className="hk-card__head">
          <div>
            {title && <h2 className="hk-card__title">{title}</h2>}
            {subtitle && <p className="hk-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="hk-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label: text, children, wide }) {
  return (
    <label className={`hk-field${wide ? ' hk-field--wide' : ''}`}>
      <span className="hk-field__label">{text}</span>
      {children}
    </label>
  )
}

export function Notice({ tone: noticeTone = 'violet', title, children }) {
  return (
    <div className={`hk-notice hk-notice--${noticeTone}`} role={noticeTone === 'red' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="hk-search">
      <SearchIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Stat({ title, value, note, valueTone }) {
  return (
    <div className="hk-stat">
      <span className="hk-stat__title">{title}</span>
      <strong className={`hk-stat__value${valueTone ? ` hk-text--${valueTone}` : ''}`}>{value}</strong>
      {note && <span className="hk-stat__note">{note}</span>}
    </div>
  )
}

// Table whose rows can be selected (selected row is highlighted in gold).
export function DataTable({ columns, rows, rowKey, selectedKey, onSelect, empty = 'No records found.' }) {
  return (
    <div className="hk-table-wrap">
      <table className="hk-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="hk-table__empty">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = row[rowKey]
            return (
              <tr
                key={key}
                className={key === selectedKey ? 'is-selected' : ''}
                onClick={onSelect ? () => onSelect(row) : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={onSelect ? (e) => e.key === 'Enter' && onSelect(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LoadState({ loading, error }) {
  if (error) return <Notice tone="red" title="Could not load data">{error.message}</Notice>
  if (loading) return <p className="hk-muted">Loading...</p>
  return null
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
