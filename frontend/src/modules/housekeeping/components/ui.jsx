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
// On phones, tables with four or more columns show each row as a small card
// (the column titles come from data-label).
export function DataTable({ columns, rows, rowKey, selectedKey, onSelect, empty = 'No records found.', darkHover }) {
  const stack = columns.length >= 4
  return (
    <div className="hk-table-wrap">
      <table className={`hk-table${darkHover ? ' hk-table--dark-hover' : ''}${stack ? ' hk-table--stack' : ''}`}>
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
                  <td key={c.key} data-label={c.title}>{c.render ? c.render(row) : row[c.key]}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function paginationItems(current, total) {
  const numbers = Array.from({ length: total }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === total || Math.abs(number - current) <= 1)
  const items = []
  numbers.forEach((number, index) => {
    if (index && number - numbers[index - 1] > 1) items.push(`gap-${number}`)
    items.push(number)
  })
  return items
}

export function Pagination({ page, pageSize, total, onPageChange, itemLabel = 'records' }) {
  if (total <= pageSize) return null
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount)
  const first = total ? (currentPage - 1) * pageSize + 1 : 0
  const last = Math.min(currentPage * pageSize, total)

  return (
    <nav className="hk-pagination" aria-label={`${itemLabel} pages`}>
      <span>Showing {first}-{last} of {total} {itemLabel} · {pageSize} per page</span>
      <div>
        <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>
        {paginationItems(currentPage, pageCount).map((item) => typeof item === 'string' ? (
          <span key={item} className="hk-pagination__gap" aria-hidden="true">…</span>
        ) : (
          <button
            type="button"
            key={item}
            className={item === currentPage ? 'is-active' : ''}
            aria-current={item === currentPage ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" disabled={currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    </nav>
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

// Row of filter chips; "All" plus one chip per value, with optional counts.
export function StatusChips({ options, value, onChange, counts, allLabel = 'All' }) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  return (
    <div className="hk-chips" role="group" aria-label="Filter by status">
      {[['', allLabel, total], ...options.map((o) => [o, label(o), counts?.[o]])].map(([v, text, n]) => (
        <button
          key={v || 'all'}
          type="button"
          className={`hk-chip${value === v ? ' is-active' : ''}`}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {text}
          {n !== undefined && n !== null && <span>{n}</span>}
        </button>
      ))}
    </div>
  )
}
