import { useState } from 'react'
import { api } from '../api.js'
import { BarChart } from '../components/charts.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox, Stat } from '../components/ui.jsx'
import { addDays, formatDateTime, label, longDate, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'

const PRESETS = [
  { id: '7', name: 'Last 7 days', range: (t) => [addDays(t, -6), t] },
  { id: '30', name: 'Last 30 days', range: (t) => [addDays(t, -29), t] },
  { id: 'month', name: 'This month', range: (t) => [`${t.slice(0, 7)}-01`, t] },
]

const minutes = (m) => (m === null || m === undefined ? '-' : `${m} min`)
const percent = (a, b) => (a + b ? `${Math.round((a / (a + b)) * 100)}%` : '-')

// History tables: what each one lists, and its columns on screen and in exports.
const HISTORY = {
  tasks: {
    name: 'Cleaning tasks',
    columns: [
      { key: 'at', title: 'Completed', value: (r) => formatDateTime(r.completion_time) },
      { key: 'room', title: 'Room', value: (r) => r.room_number },
      { key: 'type', title: 'Task', value: (r) => label(r.task_type) },
      { key: 'staff', title: 'Housekeeper', value: (r) => r.staff_name },
      { key: 'minutes', title: 'Time taken', value: (r) => minutes(r.minutes) },
      { key: 'status', title: 'Status', value: (r) => label(r.task_status), badge: (r) => r.task_status },
    ],
  },
  inspections: {
    name: 'Inspections',
    columns: [
      { key: 'at', title: 'Inspected', value: (r) => formatDateTime(r.at) },
      { key: 'room', title: 'Room', value: (r) => r.room_number },
      { key: 'result', title: 'Result', value: (r) => label(r.inspection_result), badge: (r) => r.inspection_result },
      { key: 'staff', title: 'Cleaned by', value: (r) => r.staff_name || '-' },
      { key: 'inspector', title: 'Inspector', value: (r) => r.inspector },
      { key: 'remarks', title: 'Remarks', value: (r) => r.remarks || '-' },
    ],
  },
  status: {
    name: 'Room status changes',
    columns: [
      { key: 'at', title: 'Changed', value: (r) => formatDateTime(r.at) },
      { key: 'room', title: 'Room', value: (r) => r.room_number },
      { key: 'from', title: 'From', value: (r) => label(r.previous_status) },
      { key: 'to', title: 'To', value: (r) => label(r.new_status), badge: (r) => r.new_status },
      { key: 'staff', title: 'By', value: (r) => r.staff_name || '-' },
      { key: 'remarks', title: 'Remarks', value: (r) => r.remarks || '-' },
    ],
  },
}

// Reports: supervisors and inspectors review performance and history for a
// date range, and export it as PDF or Excel.
export default function ReportsPage() {
  const today = todayISO()
  const [preset, setPreset] = useState('7')
  const [range, setRange] = useState(() => PRESETS[0].range(today))
  const [from, to] = range
  const [type, setType] = useState('tasks')
  const [search, setSearch] = useState('')

  const valid = from && to && from <= to
  const summary = useLoad(() => (valid ? api.reportSummary(from, to) : Promise.resolve(null)), [from, to])
  const history = useLoad(() => (valid ? api.reportHistory(type, from, to) : Promise.resolve(null)), [type, from, to])

  function choose(id) {
    setPreset(id)
    setRange(PRESETS.find((p) => p.id === id).range(today))
  }
  const setDate = (i) => (e) => {
    const next = [...range]
    next[i] = e.target.value
    setPreset('')
    setRange(next)
  }

  const t = summary.data?.totals
  const rangeText = valid ? `${longDate(from, { month: 'short', day: 'numeric' })} – ${longDate(to, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''
  const def = HISTORY[type]
  const q = search.toLowerCase()
  const rows = (history.data?.rows || []).filter(
    (r) => !q || def.columns.some((c) => String(c.value(r) ?? '').toLowerCase().includes(q))
  )
  const staffRows = summary.data?.staff || []

  return (
    <div className="hk-stack">
      <Card title="Report period" subtitle={rangeText}>
        <div className="hk-toolbar hk-toolbar--wrap">
          <div className="hk-chips" role="group" aria-label="Quick ranges">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`hk-chip${preset === p.id ? ' is-active' : ''}`} aria-pressed={preset === p.id} onClick={() => choose(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="hk-form hk-form--inline">
            <Field label="From"><input type="date" value={from} max={to || today} onChange={setDate(0)} /></Field>
            <Field label="To"><input type="date" value={to} min={from} max={today} onChange={setDate(1)} /></Field>
          </div>
        </div>
        {!valid && <Notice tone="amber" title="Check the dates">The From date must be on or before the To date.</Notice>}
      </Card>

      <LoadState loading={summary.loading && !summary.data} error={summary.error} />
      {t && (
        <>
          <div className="hk-stats">
            <Stat title="ROOMS CLEANED" value={t.tasks_completed} note={`Average ${minutes(t.avg_clean_minutes)} per room`} />
            <Stat title="INSPECTION PASS RATE" value={percent(t.inspections_passed, t.inspections_failed)} note={`${t.inspections_passed} passed · ${t.inspections_failed} returned`} valueTone={t.inspections_failed > t.inspections_passed ? 'red' : undefined} />
            <Stat title="GUEST REQUESTS DONE" value={t.requests_completed} note={`${t.requests_received} received · avg ${minutes(t.avg_request_minutes)}`} />
            <Stat title="MAINTENANCE REPORTED" value={t.maintenance_reported} note="Sent to Engineering" />
            <Stat title="LOST & FOUND" value={t.items_found} note={`${t.items_released} released · ${t.items_disposed} disposed`} />
          </div>

          <div className="hk-grid hk-grid--even">
            <Card title="Rooms cleaned per day" subtitle="Cleaning tasks completed">
              <BarChart
                label="Rooms cleaned per day"
                data={summary.data.daily.slice(-14).map((d) => ({ label: longDate(d.day, { month: 'short', day: 'numeric' }), value: d.tasks_completed }))}
              />
              {summary.data.daily.length > 14 && <p className="hk-muted">Showing the last 14 days of the period. The totals above cover the whole period.</p>}
            </Card>
            <Card
              title="Staff performance"
              subtitle="Work completed in the period"
              actions={
                <ExportMenu
                  title={`Staff Performance (${rangeText})`}
                  fileName={`staff-performance-${from}-to-${to}`}
                  rows={staffRows}
                  columns={[
                    { title: 'Staff', value: (s) => s.name },
                    { title: 'Position', value: (s) => label(s.position) },
                    { title: 'Rooms cleaned', value: (s) => s.tasks_completed },
                    { title: 'Avg time', value: (s) => minutes(s.avg_clean_minutes) },
                    { title: 'Passed', value: (s) => s.passed },
                    { title: 'Returned', value: (s) => s.failed },
                    { title: 'Requests done', value: (s) => s.requests_completed },
                    { title: 'Shifts', value: (s) => s.shifts },
                  ]}
                />
              }
            >
              <DataTable
                rowKey="user_id"
                rows={staffRows}
                columns={[
                  { key: 'name', title: 'Staff', render: (s) => <span><strong>{s.name}</strong><small className="hk-block">{label(s.position)}</small></span> },
                  { key: 'clean', title: 'Rooms', render: (s) => s.tasks_completed },
                  { key: 'avg', title: 'Avg time', render: (s) => minutes(s.avg_clean_minutes) },
                  { key: 'pass', title: 'Pass rate', render: (s) => percent(s.passed, s.failed) },
                  { key: 'req', title: 'Requests', render: (s) => s.requests_completed },
                ]}
              />
            </Card>
          </div>
        </>
      )}

      <Card
        title="History"
        subtitle={`${def.name}, newest first`}
        actions={
          <ExportMenu
            title={`${def.name} (${rangeText})`}
            fileName={`${type}-history-${from}-to-${to}`}
            rows={rows}
            columns={def.columns.map((c) => ({ title: c.title, value: c.value }))}
          />
        }
      >
        <div className="hk-toolbar hk-toolbar--wrap">
          <div className="hk-chips" role="group" aria-label="History type">
            {Object.entries(HISTORY).map(([id, h]) => (
              <button key={id} type="button" className={`hk-chip${type === id ? ' is-active' : ''}`} aria-pressed={type === id} onClick={() => setType(id)}>
                {h.name}
              </button>
            ))}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="Search room or staff" />
        </div>
        <LoadState loading={history.loading && !history.data} error={history.error} />
        <DataTable
          rowKey="id"
          rows={rows}
          empty="Nothing recorded in this period."
          columns={def.columns.map((c) => ({
            key: c.key,
            title: c.title,
            render: c.badge ? (r) => <Badge value={c.badge(r)} /> : (r) => c.value(r),
          }))}
        />
        {rows.length >= 500 && <p className="hk-muted">Showing the latest 500 records. Choose a shorter period to see everything.</p>}
      </Card>
    </div>
  )
}
