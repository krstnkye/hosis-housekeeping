import { useMemo, useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import { Badge, Card, DataTable, LoadState, SearchBox, Stat, StatusChips } from '../components/ui.jsx'
import { formatDateTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const CATEGORIES = ['ROOM_STATUS', 'CLEANING_TASK', 'INSPECTION', 'SCHEDULE', 'GUEST_REQUEST', 'LOST_FOUND', 'ITEM_CLAIM', 'MAINTENANCE', 'INVENTORY']
const REPORT_COLUMNS = [
  { title: 'Date and time', value: (e) => formatDateTime(e.occurred_at) },
  { title: 'Category', value: (e) => label(e.category) },
  { title: 'Reference', value: (e) => e.reference },
  { title: 'Details', value: (e) => e.details },
  { title: 'Recorded by', value: (e) => e.actor },
]
const PAGE_SIZE = 10

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

export default function ReportsAuditPage() {
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('WEEKLY')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState(1)
  const audit = useLoad(
    () => api.audit(`?limit=500&period=${period}&anchor=${anchor}`),
    [period, anchor]
  )
  const all = useMemo(() => audit.data?.events || [], [audit.data])
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c, all.filter((e) => e.category === c).length])), [all])
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all.filter((e) => (!category || e.category === category) && (!term || [e.reference, e.details, e.actor].some((v) => v?.toLowerCase().includes(term))))
  }, [all, category, search])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const firstRow = rows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const lastRow = Math.min(currentPage * PAGE_SIZE, rows.length)
  const pageItems = paginationItems(currentPage, pageCount)

  function changeSearch(value) {
    setSearch(value)
    setPage(1)
  }

  function changeCategory(value) {
    setCategory(value)
    setPage(1)
  }

  function changePeriod(value) {
    setPeriod(value)
    setPage(1)
  }

  function changeAnchor(value) {
    setAnchor(value)
    setPage(1)
  }

  return (
    <div className="hk-stack">
      <div className="hk-stats hk-stats--four">
        <Stat title="AUDIT EVENTS" value={all.length} note={`${label(period)} report`} />
        <Stat title="ROOM CHANGES" value={counts.ROOM_STATUS || 0} note="Status history" />
        <Stat title="INSPECTIONS" value={counts.INSPECTION || 0} note="Passed and failed" />
        <Stat title="STOCK MOVEMENTS" value={counts.INVENTORY || 0} note="Traceable inventory" />
      </div>
      <Card
        title="Housekeeping audit trail"
        subtitle="Operational records are read directly from the shared HOSIS database."
        actions={<ExportMenu title={`Housekeeping ${label(period)} Audit Trail`} fileName={`housekeeping-${period.toLowerCase()}-report`} columns={REPORT_COLUMNS} rows={rows} label="Export PDF / Excel / CSV" />}
      >
        <div className="hk-toolbar">
          <SearchBox value={search} onChange={changeSearch} placeholder="Search room, item, action or staff..." />
          <label className="hk-inline-field">
            Report period
            <select value={period} onChange={(e) => changePeriod(e.target.value)}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <label className="hk-inline-field">
            Date within period
            <input type="date" value={anchor} onChange={(e) => changeAnchor(e.target.value)} />
          </label>
        </div>
        <StatusChips options={CATEGORIES} value={category} onChange={changeCategory} counts={counts} allLabel="All activity" />
        <LoadState loading={audit.loading && !audit.data} error={audit.error} />
        <DataTable
          rowKey="event_id"
          rows={pageRows}
          empty="No audit events match the selected filters."
          columns={[
            { key: 'time', title: 'Date & time', render: (e) => formatDateTime(e.occurred_at) },
            { key: 'category', title: 'Category', render: (e) => <Badge value={e.category}>{label(e.category)}</Badge> },
            { key: 'reference', title: 'Reference' },
            { key: 'details', title: 'Recorded action' },
            { key: 'actor', title: 'Recorded by' },
          ]}
        />
        <nav className="hk-pagination" aria-label="Audit trail pages">
          <span>Showing {firstRow}-{lastRow} of {rows.length} records · 10 per page</span>
          <div>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            {pageItems.map((item) => typeof item === 'string' ? (
              <span key={item} className="hk-pagination__gap" aria-hidden="true">…</span>
            ) : (
              <button
                type="button"
                key={item}
                className={item === currentPage ? 'is-active' : ''}
                aria-current={item === currentPage ? 'page' : undefined}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            ))}
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </nav>
        <p className="hk-footnote">Showing {audit.data?.report?.from || '-'} to {audit.data?.report?.to || '-'} (end date exclusive). The audit trail is read-only so accountability is preserved.</p>
      </Card>
    </div>
  )
}
