import { api } from '../api.js'
import { BarChart, DonutChart } from '../components/charts.jsx'
import StatusIcon from '../components/statusIcons.jsx'
import { Badge, Card, DataTable, LoadState } from '../components/ui.jsx'
import { formatTime, label, ROOM_STATUSES } from '../format.js'
import { useLoad } from '../useLoad.js'

const BOXES = [
  { status: 'OCCUPIED', note: 'Guests in room' },
  { status: 'DIRTY', note: 'Need cleaning' },
  { status: 'CLEAN', note: 'Awaiting inspection' },
  { status: 'INSPECTED', note: 'Ready for Front Office' },
  { status: 'OUT_OF_ORDER', note: 'Under repair' },
]

// Categorical slots in fixed order, one per room status.
const ROOM_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
const TASK_STAGES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RETURNED', 'INSPECTED']

// Housekeeping Dashboard (flowchart: Housekeeping Dashboard).
export default function OverviewPage() {
  const { data, error, loading } = useLoad(
    () => Promise.all([api.rooms(), api.tasks(), api.tasks('?mine=1')]),
    []
  )
  if (!data) return <LoadState loading={loading} error={error} />
  const [{ summary }, { tasks }, { tasks: mine }] = data

  const taskBars = TASK_STAGES.map((s) => ({ label: label(s), value: tasks.filter((t) => t.task_status === s).length }))
  const roomSlices = ROOM_STATUSES.map((s, i) => ({ label: label(s), value: summary[s], color: ROOM_COLORS[i] }))
  const totalRooms = Object.values(summary).reduce((a, b) => a + b, 0)

  return (
    <div className="hk-stack">
      <div className="hk-stats">
        {BOXES.map((b) => (
          <div key={b.status} className="hk-stat hk-stat--icon">
            <StatusIcon status={b.status} />
            <div>
              <span className="hk-stat__title">{label(b.status)}</span>
              <strong className="hk-stat__value">{summary[b.status]}</strong>
              <span className="hk-stat__note">{b.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hk-grid">
        <Card title="Cleaning tasks today" subtitle="Number of tasks at each stage">
          <BarChart data={taskBars} label="Bar chart of today's cleaning tasks by stage" />
        </Card>
        <Card title="Room status" subtitle={`All ${totalRooms} rooms`}>
          <DonutChart data={roomSlices} total={totalRooms} centerLabel="rooms" label="Donut chart of rooms by status" />
        </Card>
      </div>

      <Card title="My tasks" subtitle="Cleaning tasks assigned to you">
        <DataTable
          rowKey="task_id"
          rows={mine}
          empty="No tasks assigned to you right now."
          columns={[
            { key: 'room', title: 'Room', render: (t) => `${t.room_number} · ${t.room_type}` },
            { key: 'type', title: 'Type', render: (t) => label(t.task_type) },
            { key: 'due', title: 'Due', render: (t) => formatTime(t.due_time) },
            { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority} /> },
            { key: 'status', title: 'Status', render: (t) => <Badge value={t.task_status} /> },
          ]}
        />
      </Card>
    </div>
  )
}
