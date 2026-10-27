import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox, Stat } from '../components/ui.jsx'
import { formatDateTime, label, ROOM_STATUSES } from '../format.js'
import { useLoad } from '../useLoad.js'

// HK-001 View Room Status, HK-002 Select Room, HK-003 Update Room Status.
export default function RoomStatusPage({ search: topSearch }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const rooms = useLoad(() => api.rooms(filter ? `?status=${filter}` : ''), [filter])

  const query = (search || topSearch).toLowerCase()
  const list = (rooms.data?.rooms || []).filter(
    (r) => !query || `${r.room_number} ${r.room_type} ${r.housekeeper || ''}`.toLowerCase().includes(query)
  )
  const summary = rooms.data?.summary
  const activeId = selectedId ?? list[0]?.room_id

  return (
    <div className="hk-stack">
      {summary && (
        <div className="hk-stats">
          <Stat title="Occupied" value={summary.OCCUPIED} />
          <Stat title="Dirty" value={summary.DIRTY} valueTone="amber" />
          <Stat title="Clean" value={summary.CLEAN} note="Awaiting inspection" />
          <Stat title="Inspected" value={summary.INSPECTED} note="Ready for Front Office" valueTone="green" />
          <Stat title="Out of order" value={summary.OUT_OF_ORDER} valueTone="red" />
        </div>
      )}
      <div className="hk-grid">
        <Card
          title="Room overview"
          subtitle={summary ? `${summary.DIRTY} dirty · ${summary.CLEAN} clean · ${summary.OUT_OF_ORDER} out of order` : ''}
        >
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search room number or type" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All status</option>
              {ROOM_STATUSES.map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
          </div>
          <LoadState loading={rooms.loading && !rooms.data} error={rooms.error} />
          <DataTable
            rowKey="room_id"
            rows={list}
            selectedKey={activeId}
            onSelect={(r) => setSelectedId(r.room_id)}
            columns={[
              { key: 'room', title: 'Room / Type', render: (r) => <strong>{r.room_number} · {r.room_type}</strong> },
              { key: 'status', title: 'Status', render: (r) => <Badge value={r.room_status} /> },
              { key: 'hk', title: 'Housekeeper', render: (r) => r.housekeeper?.trim() || (r.task_id ? 'Unassigned' : '-') },
              { key: 'task', title: 'Cleaning task', render: (r) => (r.task_status ? label(r.task_status) : '-') },
            ]}
          />
          <p className="hk-footnote">Front Office releases INSPECTED rooms as AVAILABLE.</p>
        </Card>
        {activeId ? (
          <RoomDetail key={activeId} roomId={activeId} onSaved={rooms.reload} />
        ) : (
          <Card title="Room details"><p className="hk-muted">Select a room.</p></Card>
        )}
      </div>
    </div>
  )
}

function RoomDetail({ roomId, onSaved }) {
  const detail = useLoad(() => api.room(roomId), [roomId])
  const [status, setStatus] = useState('')
  const [remarks, setRemarks] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!detail.data) return <Card title="Room details"><LoadState loading={detail.loading} error={detail.error} /></Card>
  const { room, history, currentTask, allowedStatuses } = detail.data

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await api.setRoomStatus(roomId, { status, remarks })
      setMessage({ tone: 'green', title: `Room ${room.room_number} is now ${label(res.room.room_status)}.` })
      setStatus('')
      setRemarks('')
      detail.reload()
      onSaved()
    } catch (err) {
      setMessage({ tone: 'red', title: 'Status not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Room ${room.room_number} · ${room.room_type}`} subtitle={`Floor ${room.floor_number} · Last update ${formatDateTime(room.updated_at)}`}>
      <div className="hk-badges">
        <Badge value={room.room_status} />
        {currentTask && <Badge value={currentTask.task_status}>Task: {label(currentTask.task_status)}</Badge>}
      </div>
      {currentTask && (
        <p className="hk-muted">
          {label(currentTask.task_type)} cleaning{currentTask.housekeeper?.trim() ? ` by ${currentTask.housekeeper}` : ', not yet assigned'}.
        </p>
      )}

      <div className="hk-form">
        <Field label="Update housekeeping status" wide>
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!allowedStatuses.length}>
            <option value="">{allowedStatuses.length ? 'Select new status' : 'No manual change allowed'}</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </Field>
        <Field label="Status note" wide>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Cleaning complete, inspection requested" />
        </Field>
      </div>
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={!status || busy} onClick={save}>
          Save status
        </button>
        {room.room_status === 'CLEAN' && (
          <a className="hk-btn hk-btn--secondary" href="#/housekeeping/inspection">Open inspection</a>
        )}
        {room.room_status === 'OUT_OF_ORDER' && (
          <a className="hk-btn hk-btn--secondary" href="#/housekeeping/maintenance">View maintenance</a>
        )}
      </div>

      {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
      {room.room_status === 'INSPECTED' ? (
        <Notice tone="green" title="Front Office notified">Room passed inspection and can be released as AVAILABLE.</Notice>
      ) : (
        <Notice tone="amber" title="Front Office: not available yet">
          The room is released to Front Office after it passes inspection.
        </Notice>
      )}

      <h3 className="hk-subhead">Status history</h3>
      {history.length === 0 && <p className="hk-muted">No changes recorded yet.</p>}
      <ul className="hk-list">
        {history.map((h) => (
          <li key={h.log_id}>
            <span>
              {label(h.previous_status)} → <strong>{label(h.new_status)}</strong>
              {h.remarks ? ` · ${h.remarks}` : ''}
            </span>
            <small>{h.changed_by?.trim() || 'System'} · {formatDateTime(h.changed_at)}</small>
          </li>
        ))}
      </ul>
    </Card>
  )
}
