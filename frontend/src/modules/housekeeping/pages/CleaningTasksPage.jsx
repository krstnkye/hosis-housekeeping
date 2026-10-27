import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox } from '../components/ui.jsx'
import { formatDateTime, formatTime, label, PRIORITIES } from '../format.js'
import { useLoad } from '../useLoad.js'

const TASK_TYPES = ['CHECKOUT', 'STAYOVER', 'DEEP_CLEAN', 'TOUCH_UP', 'POST_REPAIR']
const PROGRESS = { PENDING: 0, ASSIGNED: 15, RETURNED: 15, IN_PROGRESS: 55, COMPLETED: 85, INSPECTED: 100 }

// HK-004 Create/Update Task, HK-005 Assign Housekeeper, HK-006 Perform Cleaning.
export default function CleaningTasksPage({ user, search: topSearch }) {
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState(user.position === 'HOUSEKEEPER')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const tasks = useLoad(() => api.tasks(mine ? '?mine=1' : ''), [mine])
  const workload = useLoad(() => api.workload(), [])
  const lookups = useLoad(() => Promise.all([api.rooms(), api.staff()]), [])
  const isSupervisor = user.position === 'SUPERVISOR' || user.role === 'ADMIN'

  const query = (search || topSearch).toLowerCase()
  const list = (tasks.data?.tasks || []).filter(
    (t) => !query || `${t.room_number} ${t.housekeeper || ''} ${t.task_type}`.toLowerCase().includes(query)
  )
  const selected = creating ? null : list.find((t) => t.task_id === selectedId) || list[0]

  function refresh(taskId, msg) {
    setFlash(msg)
    if (taskId) setSelectedId(taskId)
    setCreating(false)
    tasks.reload()
    workload.reload()
  }

  return (
    <div className="hk-grid">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title="Today's cleaning queue" subtitle={`${list.length} task(s) · ordered by priority and due time`}>
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search room or housekeeper" />
            <select value={mine ? 'mine' : 'all'} onChange={(e) => setMine(e.target.value === 'mine')} aria-label="Show tasks">
              <option value="all">All tasks</option>
              <option value="mine">My tasks</option>
            </select>
          </div>
          <LoadState loading={tasks.loading && !tasks.data} error={tasks.error} />
          <DataTable
            rowKey="task_id"
            rows={list}
            selectedKey={selected?.task_id}
            onSelect={(t) => {
              setCreating(false)
              setSelectedId(t.task_id)
            }}
            columns={[
              { key: 'room', title: 'Room / Task', render: (t) => <strong>{t.room_number} · {label(t.task_type)}</strong> },
              { key: 'hk', title: 'Housekeeper', render: (t) => t.housekeeper?.trim() || 'Unassigned' },
              { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority} /> },
              { key: 'status', title: 'Progress', render: (t) => <Badge value={t.task_status} /> },
            ]}
          />
          <p className="hk-footnote">Completed tasks move to Inspection. Returned tasks need re-cleaning.</p>
        </Card>
        <Card title="Housekeeper workload" subtitle="Open and finished tasks today">
          <div className="hk-workload">
            {(workload.data?.workload || []).map((w) => (
              <div key={w.user_id}>
                <strong>{w.name}</strong>
                <span>{w.open_tasks} open · {w.done_tasks} done</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {lookups.data && (creating || selected || isSupervisor) ? (
        <TaskForm
          key={creating ? 'new' : selected?.task_id || 'new'}
          task={selected}
          rooms={lookups.data[0].rooms}
          staff={lookups.data[1].staff.filter((s) => s.position === 'HOUSEKEEPER')}
          user={user}
          isSupervisor={isSupervisor}
          onNew={() => setCreating(true)}
          onSaved={refresh}
        />
      ) : (
        <Card title="Update cleaning task">
          <LoadState loading={lookups.loading} error={lookups.error} />
          {!lookups.loading && <p className="hk-muted">No task selected.</p>}
        </Card>
      )}
    </div>
  )
}

function TaskForm({ task, rooms, staff, user, isSupervisor, onNew, onSaved }) {
  const [form, setForm] = useState({
    roomId: task?.room_id || '',
    priority: task?.priority || 'NORMAL',
    taskType: task?.task_type || 'CHECKOUT',
    dueTime: task?.due_time?.slice(0, 5) || '',
    staffId: task?.staff_id || '',
    notes: task?.notes || '',
  })
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const isNew = !task
  const canWork = task && (task.staff_id === user.userId || isSupervisor)
  const closed = task?.task_status === 'INSPECTED'

  async function run(action, successText) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await action()
      onSaved(res.task?.task_id, { tone: 'green', title: successText })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const payload = { ...form, staffId: form.staffId || null, dueTime: form.dueTime || null }
  // Rooms that still need cleaning are listed first.
  const roomOptions = [...rooms].sort((a, b) => (b.room_status === 'DIRTY') - (a.room_status === 'DIRTY'))

  return (
    <Card
      title={isNew ? 'New cleaning task' : 'Update cleaning task'}
      subtitle={isNew ? 'Create a task and assign a housekeeper' : `Task #${task.task_id} · Room ${task.room_number} · created ${formatDateTime(task.created_at)}`}
      actions={isSupervisor && !isNew && <button type="button" className="hk-btn hk-btn--secondary" onClick={onNew}>+ New task</button>}
    >
      {!isNew && <div className="hk-badges"><Badge value={task.task_status} /><Badge value={task.priority}>{label(task.priority)} priority</Badge></div>}

      <div className="hk-form">
        <Field label="Room">
          <select value={form.roomId} onChange={set('roomId')} disabled={!isNew}>
            <option value="">Select room</option>
            {roomOptions.map((r) => (
              <option key={r.room_id} value={r.room_id} disabled={r.room_status === 'OUT_OF_ORDER'}>
                {r.room_number} · {r.room_type} ({label(r.room_status)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={set('priority')} disabled={!isSupervisor || closed}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Cleaning type">
          <select value={form.taskType} onChange={set('taskType')} disabled={!isSupervisor || closed}>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        <Field label="Due">
          <input type="time" value={form.dueTime} onChange={set('dueTime')} disabled={!isSupervisor || closed} />
        </Field>
        <Field label="Assigned housekeeper" wide>
          <select value={form.staffId} onChange={set('staffId')} disabled={!isSupervisor || closed}>
            <option value="">Not assigned</option>
            {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Notes" wide>
          <input value={form.notes} onChange={set('notes')} disabled={!isSupervisor || closed} placeholder="Special instructions" />
        </Field>
      </div>

      {!isNew && (
        <div className="hk-progress">
          <div className="hk-progress__label">
            <span>Progress: {label(task.task_status)}</span>
            <span>
              {task.start_time && `Started ${formatTime(task.start_time)}`}
              {task.completion_time && ` · Done ${formatTime(task.completion_time)}`}
            </span>
          </div>
          <div className="hk-progress__bar"><span style={{ width: `${PROGRESS[task.task_status]}%` }} /></div>
        </div>
      )}

      {task?.task_status === 'RETURNED' && (
        <Notice tone="red" title="Returned for re-cleaning">This room failed inspection. Start cleaning again and mark it complete.</Notice>
      )}
      {task?.task_status === 'COMPLETED' && (
        <Notice tone="violet" title="Completed - awaiting inspection">An inspector will check this room before it is released.</Notice>
      )}
      {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}

      <div className="hk-actions">
        {isSupervisor && !closed && (
          <button
            type="button"
            className="hk-btn hk-btn--primary"
            disabled={busy || (isNew && !form.roomId)}
            onClick={() =>
              isNew
                ? run(() => api.createTask(payload), 'Cleaning task created.')
                : run(() => api.updateTask(task.task_id, payload), 'Changes saved.')
            }
          >
            {isNew ? 'Create task' : 'Save changes'}
          </button>
        )}
        {canWork && ['ASSIGNED', 'RETURNED'].includes(task.task_status) && (
          <button type="button" className="hk-btn hk-btn--secondary" disabled={busy} onClick={() => run(() => api.startTask(task.task_id), 'Cleaning started.')}>
            Start cleaning
          </button>
        )}
        {canWork && task.task_status === 'IN_PROGRESS' && (
          <button type="button" className="hk-btn hk-btn--secondary" disabled={busy} onClick={() => run(() => api.completeTask(task.task_id), 'Marked complete. Room is now CLEAN and waiting for inspection.')}>
            Mark complete
          </button>
        )}
      </div>
    </Card>
  )
}
