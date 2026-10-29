import { api } from '../api.js'
import { DonutChart } from '../components/charts.jsx'
import StatusIcon from '../components/statusIcons.jsx'
import { Card, LoadState, Notice } from '../components/ui.jsx'
import { label } from '../format.js'
import { useLoad } from '../useLoad.js'

// Status colors from the Figma dashboard. Every bar and slice also carries its
// icon, name and count, so color is never the only way to tell them apart.
const STATUSES = [
  { status: 'OCCUPIED', color: '#1a1265', box: 'Unavailable for assignment', note: 'unavailable for assignment' },
  { status: 'DIRTY', color: '#f5b800', box: 'Cleaning required', note: 'cleaning required' },
  { status: 'CLEAN', color: '#4a72c9', box: 'Awaiting inspection', note: 'pending final approval', name: 'Clean / awaiting inspection' },
  { status: 'INSPECTED', color: '#8a6a05', box: 'Vacant and approved', note: 'vacant and approved' },
  { status: 'OUT_OF_ORDER', color: '#d83a3a', box: 'Blocked', note: 'blocked' },
]
const OTHER_COLOR = '#c9c6d8'

// Housekeeping Dashboard (flowchart: Housekeeping Dashboard).
export default function OverviewPage() {
  const { data, error, loading } = useLoad(
    () => Promise.all([api.rooms(), api.tasks(), api.guestRequests(), api.maintenance(), api.workload()]),
    []
  )
  if (!data) return <LoadState loading={loading} error={error} />
  const [{ rooms, summary }, { tasks }, { requests }, { requests: issues }, { workload }] = data

  const total = rooms.length
  const ooo = rooms.filter((r) => r.room_status === 'OUT_OF_ORDER')
  const other = (summary.AVAILABLE || 0) + (summary.RESERVED || 0)
  const max = Math.max(1, ...STATUSES.map((s) => summary[s.status]))
  const slices = [
    ...STATUSES.map((s) => ({ label: s.name || label(s.status), value: summary[s.status], color: s.color })),
    ...(other ? [{ label: 'Available / reserved', value: other, color: OTHER_COLOR }] : []),
  ]

  const open = tasks.filter((t) => !['COMPLETED', 'INSPECTED'].includes(t.task_status))
  const inProgress = tasks.filter((t) => t.task_status === 'IN_PROGRESS').length
  const waiting = tasks.filter((t) => t.task_status === 'COMPLETED')
  const openRequests = requests.filter((q) => q.request_status !== 'COMPLETED')
  const unassigned = openRequests.filter((q) => !q.staff_id).length
  const repairs = issues.filter((m) => m.status !== 'CLOSED')
  const roomList = (list) => list.slice(0, 3).map((r) => `Room ${r.room_number}`).join(', ')

  return (
    <div className="hk-stack">
      <div className="hk-stats">
        {STATUSES.map((s) => (
          <div key={s.status} className="hk-stat hk-stat--figma">
            <span className="hk-stat__title">
              <StatusIcon status={s.status} small />
              {label(s.status).toUpperCase()}
            </span>
            <strong className="hk-stat__value">{summary[s.status]}</strong>
            <span className="hk-stat__note">
              {s.status === 'OUT_OF_ORDER' && ooo.length ? `${roomList(ooo)} · ${s.box}` : s.box}
            </span>
          </div>
        ))}
      </div>

      <Card title="Room status overview" subtitle={`${total} total rooms · Occupancy and readiness snapshot`}>
        <div className="hk-overview">
          <div>
            <div className="hk-overview__head">
              <span>Snapshot</span>
              <span>{total} total</span>
            </div>
            <ul className="hk-bars">
              {STATUSES.map((s) => {
                const n = summary[s.status]
                return (
                  <li key={s.status}>
                    <StatusIcon status={s.status} small />
                    <span className="hk-bars__text">
                      <strong>{s.name || label(s.status)}</strong>
                      <small>{n} room{n === 1 ? '' : 's'} · {s.note}</small>
                    </span>
                    <span className="hk-bars__track" aria-hidden="true">
                      <span style={{ width: `${(n / max) * 100}%`, background: s.color }} />
                    </span>
                    <strong className="hk-bars__count">{n}</strong>
                  </li>
                )
              })}
            </ul>
          </div>
          <DonutChart data={slices} total={total} centerLabel="Total rooms" label="Donut chart of rooms by status" hideLegend />
        </div>
      </Card>

      <Card title="Pending work & reports">
        <ul className="hk-list hk-list--plain">
          <li>
            <span>{open.length} cleaning task{open.length === 1 ? '' : 's'} · {inProgress} in progress, {open.length - inProgress} to do</span>
          </li>
          <li>
            <span>
              {waiting.length} pending inspection{waiting.length === 1 ? '' : 's'}
              {waiting.length ? ` · Room ${waiting[0].room_number} included` : ''}
            </span>
          </li>
          <li>
            <span>
              {openRequests.length} open guest request{openRequests.length === 1 ? '' : 's'}
              {unassigned ? ` · ${unassigned} awaiting assignment` : ' · Confirm delivery first'}
            </span>
          </li>
        </ul>
        {ooo.map((r) => (
          <Notice key={r.room_id} tone="amber" title={`Room ${r.room_number} remains OUT OF ORDER`}>
            Engineering repair in progress, not cleared. Clean rooms must pass inspection before release.
          </Notice>
        ))}
        {repairs.length > 0 && (
          <a className="hk-link" href="#/housekeeping/maintenance">
            Maintenance report · {repairs.map((m) => `Room ${m.room_number}`).join(', ')} · {label(repairs[0].status)}
          </a>
        )}
      </Card>

      <Card title="Housekeeper workload" actions={<small className="hk-muted">Complete / assigned</small>}>
        <div className="hk-workload hk-workload--plain">
          {workload.map((w) => (
            <div key={w.user_id}>
              <span>{w.name}</span>
              <strong className="hk-workload__count">{w.done_tasks} / {w.open_tasks + w.done_tasks}</strong>
            </div>
          ))}
        </div>
        <p className="hk-footnote">
          {open.length} task{open.length === 1 ? '' : 's'} remaining across {workload.length} housekeeper{workload.length === 1 ? '' : 's'}
        </p>
      </Card>
    </div>
  )
}
