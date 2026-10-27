import { api } from '../api.js'
import { Badge, Card, DataTable, LoadState, Stat } from '../components/ui.jsx'
import { formatDateTime, formatTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const FUNCTIONS = [
  { id: 'rooms', name: 'Manage Room Status', text: 'View, select and update room status (HK-001 to HK-003).' },
  { id: 'tasks', name: 'Manage Cleaning Tasks', text: 'Create, assign and perform cleaning (HK-004 to HK-006).' },
  { id: 'inspection', name: 'Inspect Rooms', text: 'Pass or return cleaned rooms (HK-007).' },
  { id: 'schedules', name: 'Manage Schedules', text: 'Staff shifts and workloads (HK-008, HK-009).' },
  { id: 'lost-found', name: 'Manage Lost & Found', text: 'Record, search and release items (HK-010 to HK-012).' },
  { id: 'requests', name: 'Manage Guest Requests', text: 'Record, assign and complete requests (HK-013, HK-014).' },
  { id: 'maintenance', name: 'Report Maintenance Issue', text: 'Send issues to Engineering (HK-015).' },
]

export default function OverviewPage() {
  const { data, error, loading } = useLoad(
    () => Promise.all([api.dashboard(), api.tasks('?mine=1'), api.notifications()]),
    []
  )
  if (!data) return <LoadState loading={loading} error={error} />
  const [{ stats }, { tasks }, { notifications }] = data

  return (
    <div className="hk-stack">
      <div className="hk-stats">
        <Stat title="Dirty rooms" value={stats.dirty_rooms} note="Need cleaning" valueTone="amber" />
        <Stat title="Open cleaning tasks" value={stats.open_tasks} note={`${stats.my_tasks} assigned to you`} />
        <Stat title="Awaiting inspection" value={stats.awaiting_inspection} note="Cleaned, not yet inspected" />
        <Stat title="Open guest requests" value={stats.open_requests} />
        <Stat title="Out of order" value={stats.out_of_order_rooms} note={`${stats.open_maintenance} open maintenance issue(s)`} valueTone="red" />
      </div>

      <div className="hk-grid">
        <div className="hk-stack">
          <Card title="Select function" subtitle="Choose what you want to work on.">
            <div className="hk-functions">
              {FUNCTIONS.map((f) => (
                <a key={f.id} href={`#/housekeeping/${f.id}`} className="hk-function">
                  <strong>{f.name}</strong>
                  <span>{f.text}</span>
                </a>
              ))}
            </div>
          </Card>
        </div>
        <div className="hk-stack">
          <Card title="My tasks" subtitle="Cleaning tasks assigned to you">
            <DataTable
              rowKey="task_id"
              rows={tasks}
              empty="No tasks assigned to you right now."
              columns={[
                { key: 'room', title: 'Room', render: (t) => `${t.room_number} · ${t.room_type}` },
                { key: 'type', title: 'Type', render: (t) => label(t.task_type) },
                { key: 'due', title: 'Due', render: (t) => formatTime(t.due_time) },
                { key: 'status', title: 'Status', render: (t) => <Badge value={t.task_status} /> },
              ]}
            />
          </Card>
          <Card title="Front Office notifications" subtitle="Rooms Housekeeping has reported as ready">
            {notifications.length === 0 && <p className="hk-muted">No notifications yet.</p>}
            <ul className="hk-list">
              {notifications.slice(0, 5).map((n) => (
                <li key={n.notification_id}>
                  <span>{n.message}</span>
                  <small>{formatDateTime(n.created_at)}</small>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
