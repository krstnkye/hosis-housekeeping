import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import { Badge, Card, DataTable, LoadState, Pagination } from '../components/ui.jsx'
import { formatDateTime, label, longDate, staffId } from '../format.js'
import { useLoad } from '../useLoad.js'
import { usePagination } from '../usePagination.js'

const ACTIVITY = {
  TASK: 'Cleaning',
  REQUEST: 'Guest request',
  LOST_FOUND: 'Lost & found',
  MAINTENANCE: 'Maintenance',
  ROOM_CONDITION: 'Front Office',
}

const REPORT_COLUMNS = [
  { title: 'Section', value: (row) => row.section },
  { title: 'Record', value: (row) => row.record },
  { title: 'Details', value: (row) => row.details },
  { title: 'Result / total', value: (row) => row.result },
  { title: 'Date and time', value: (row) => row.at },
]

// Staff work records are transparent within Housekeeping. Every Housekeeping
// account may view and export its own or a coworker's operational report.
export default function PersonalRecordPage({ user }) {
  const currentUserId = Number(user?.userId || user?.user_id) || ''
  const [selectedId, setSelectedId] = useState(currentUserId)
  const staff = useLoad(() => api.staff(), [], { refresh: false })
  const { data, error, loading } = useLoad(
    () => selectedId ? api.staffRecord(selectedId) : api.myRecord(),
    [selectedId]
  )
  const inspectionPage = usePagination(data?.inspections || [], 10, String(selectedId))
  if (!data) return <LoadState loading={loading} error={error} />
  const { profile: p, totals: t, inspections, recent } = data

  const inspected = t.inspections_passed + t.inspections_failed
  const passRate = inspected ? Math.round((t.inspections_passed / inspected) * 100) : null
  const staffName = `${p.first_name} ${p.last_name}`
  const isOwnRecord = Number(p.user_id) === currentUserId
  const reportRows = [
    { section: 'Performance summary', record: 'Rooms cleaned', details: `${t.tasks_this_month} completed this month`, result: t.tasks_completed, at: '' },
    { section: 'Performance summary', record: 'Inspection pass rate', details: `${t.inspections_passed} passed; ${t.inspections_failed} returned`, result: passRate === null ? '-' : `${passRate}%`, at: '' },
    { section: 'Performance summary', record: 'Guest requests completed', details: 'Housekeeping guest-service requests', result: t.requests_completed, at: '' },
    { section: 'Performance summary', record: 'Shifts worked', details: `${t.shifts_this_month} scheduled this month`, result: t.shifts_worked, at: '' },
    { section: 'Performance summary', record: 'Reports filed', details: `${t.issues_reported} maintenance; ${t.conditions_reported} Front Office; ${t.items_found} found items`, result: t.issues_reported + t.conditions_reported + t.items_found, at: '' },
    ...inspections.map((item) => ({
      section: 'Inspection result',
      record: `Room ${item.room_number}`,
      details: `${label(item.task_type)}; inspected by ${item.inspector}${item.remarks ? `; ${item.remarks}` : ''}`,
      result: label(item.inspection_result),
      at: formatDateTime(item.inspected_at),
    })),
    ...recent.map((item) => ({
      section: 'Recent activity',
      record: ACTIVITY[item.type] || label(item.type),
      details: item.text,
      result: '',
      at: formatDateTime(item.at),
    })),
  ]

  return (
    <div className="hk-stack">
      <Card
        title="Download staff work report"
        subtitle="Choose yourself or a Housekeeping coworker. Exports contain work records only—not passwords, guest contacts or claim details."
        actions={(
          <ExportMenu
            title={`${staffName} — Housekeeping Work Report`}
            fileName={`housekeeping-staff-report-${p.username}`}
            columns={REPORT_COLUMNS}
            rows={reportRows}
            label="Download PDF / Excel / CSV"
          />
        )}
      >
        <label className="hk-inline-field">
          Staff member
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(Number(event.target.value))}
            disabled={staff.loading && !staff.data}
          >
            {(staff.data?.staff || []).map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}{Number(member.user_id) === currentUserId ? ' (You)' : ''} — {label(member.position)}
              </option>
            ))}
          </select>
        </label>
        {staff.error && <LoadState error={staff.error} />}
        <p className="hk-footnote">
          You are viewing {isOwnRecord ? 'your own' : `${staffName}'s`} operational Housekeeping record.
        </p>
      </Card>

      <section className="hk-record-head">
        <span className="hk-account-head__avatar hk-account-head__avatar--large" aria-hidden="true">
          {p.first_name.charAt(0)}
          {p.last_name.charAt(0)}
        </span>
        <div className="hk-record-head__name">
          <strong>{staffName}</strong>
          <span>Housekeeping {label(p.position)}</span>
        </div>
        <dl className="hk-record-head__facts">
          <div><dt>Staff ID</dt><dd>{staffId(p.user_id)}</dd></div>
          <div><dt>Status</dt><dd>{label(p.employment_status)}</dd></div>
          <div><dt>With the hotel since</dt><dd>{longDate(p.created_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
        </dl>
      </section>

      <div className="hk-stats hk-staff-stats">
        <RecordStat title="ROOMS CLEANED" value={t.tasks_completed} note={`${t.tasks_this_month} this month`} />
        <RecordStat title="INSPECTION PASS RATE" value={passRate === null ? '-' : `${passRate}%`} note={`${t.inspections_passed} passed · ${t.inspections_failed} returned`} />
        <RecordStat title="GUEST REQUESTS" value={t.requests_completed} note="completed" />
        <RecordStat title="SHIFTS WORKED" value={t.shifts_worked} note={`${t.shifts_this_month} scheduled this month`} />
        <RecordStat title="REPORTS FILED" value={t.issues_reported + t.conditions_reported + t.items_found} note={`${t.issues_reported} maintenance · ${t.conditions_reported} Front Office · ${t.items_found} found item${t.items_found === 1 ? '' : 's'}`} />
      </div>

      <div className="hk-grid">
        <Card title="Inspection results" subtitle={`${isOwnRecord ? 'Your' : `${p.first_name}'s`} most recent rooms checked by an inspector`}>
          <DataTable
            rowKey="inspection_id"
            rows={inspectionPage.rows}
            empty="None of your rooms have been inspected yet."
            columns={[
              { key: 'room', title: 'Room', render: (i) => <span><strong>Room {i.room_number}</strong><small className="hk-block">{label(i.task_type)}</small></span> },
              { key: 'result', title: 'Result', render: (i) => <Badge value={i.inspection_result} /> },
              { key: 'by', title: 'Inspector', render: (i) => i.inspector },
              { key: 'when', title: 'Date', render: (i) => <span>{formatDateTime(i.inspected_at)}{i.remarks && <small className="hk-block">{i.remarks}</small>}</span> },
            ]}
          />
          <Pagination {...inspectionPage.pagination} itemLabel="inspection results" alwaysShow />
        </Card>

        <Card title="Recent activity" subtitle={`${isOwnRecord ? 'Your' : `${p.first_name}'s`} latest work and reports`}>
          {recent.length ? (
            <ul className="hk-staff-list">
              {recent.slice(0, 5).map((a, i) => (
                <li key={`${a.type}-${i}`}>
                  <div>
                    <strong>{a.text}</strong>
                    <small>{ACTIVITY[a.type]} · {formatDateTime(a.at)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hk-muted">No activity recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function RecordStat({ title, value, note }) {
  return (
    <div className="hk-stat hk-stat--figma">
      <span className="hk-stat__title">{title}</span>
      <strong className="hk-stat__value">{value}</strong>
      <span className="hk-stat__note">{note}</span>
    </div>
  )
}
