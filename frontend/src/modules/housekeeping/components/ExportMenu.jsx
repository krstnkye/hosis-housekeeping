import { useState } from 'react'
import { exportExcel, exportPdf } from '../exportReport.js'

// "Export" dropdown with PDF and Excel options.
// columns: [{ title, value: (row) => text }]
export default function ExportMenu({ title, fileName, columns, rows, label = 'Export' }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setOpen(false)
    setError(null)
    try {
      await fn({ title, fileName, columns, rows })
    } catch (err) {
      setError(err.message || 'Export failed')
    }
  }

  return (
    <div className="hk-export">
      <button
        type="button"
        className="hk-btn hk-btn--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={!rows.length}
      >
        {label} ▾
      </button>
      {open && (
        <div className="hk-export__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run(exportPdf)}>PDF report</button>
          <button type="button" role="menuitem" onClick={() => run(exportExcel)}>Excel (.xlsx)</button>
        </div>
      )}
      {error && <span className="hk-export__error" role="alert">{error}</span>}
    </div>
  )
}
