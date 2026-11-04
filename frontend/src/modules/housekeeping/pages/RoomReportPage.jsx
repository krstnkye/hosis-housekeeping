import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, Field, LoadState, Notice } from '../components/ui.jsx'
import { formatDateTime, label, PRIORITIES } from '../format.js'
import { useLoad } from '../useLoad.js'

// Room conditions staff can report (same list as the API).
const CONDITIONS = ['DAMAGED', 'MISSING_ITEMS', 'STAINS_ODOR', 'SMOKING', 'PEST', 'SAFETY_HAZARD', 'EXCESSIVE_MESS', 'OTHER']
const CONDITION_LABELS = {
  DAMAGED: 'Damaged item or fixture',
  MISSING_ITEMS: 'Missing items',
  STAINS_ODOR: 'Stains or odor',
  SMOKING: 'Signs of smoking',
  PEST: 'Pests',
  SAFETY_HAZARD: 'Safety hazard',
  EXCESSIVE_MESS: 'Excessive mess',
  OTHER: 'Other',
}
// Maintenance categories (same as the Maintenance page).
const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE', 'APPLIANCE', 'OTHER']
const FRONT_OFFICE_HELD = ['OCCUPIED', 'RESERVED']

const EMPTY = {
  roomId: '',
  condition: 'DAMAGED',
  details: '',
  priority: 'NORMAL',
  toFrontOffice: true,
  toMaintenance: false,
  category: 'FURNITURE',
  setOutOfOrder: false,
}

// Report Room Condition: a staff member tells Front Office (room condition
// notice) and/or Maintenance (repair request for Engineering) about a room.
export default function RoomReportPage() {
  const rooms = useLoad(() => api.rooms(), [])
  const reports = useLoad(() => api.myReports(), [])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  if (!rooms.data) return <LoadState loading={rooms.loading} error={rooms.error} />
  const room = rooms.data.rooms.find((r) => String(r.room_id) === String(form.roomId))
  const held = room && FRONT_OFFICE_HELD.includes(room.room_status)
  const ready = form.roomId && form.details.trim() && (form.toFrontOffice || form.toMaintenance)

  async function send(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setResult(null)
    const sent = []
    try {
      const details = form.details.trim()
      if (form.toFrontOffice) {
        await api.reportCondition({ roomId: form.roomId, condition: form.condition, details })
        sent.push('Front Office')
      }
      if (form.toMaintenance) {
        const { request } = await api.reportIssue({
          roomId: form.roomId,
          category: form.category,
          priority: form.priority,
          description: `${CONDITION_LABELS[form.condition]}: ${details}`.slice(0, 255),
          setOutOfOrder: form.setOutOfOrder && !held,
        })
        sent.push(`Maintenance (request #${request.request_id})`)
      }
      setResult({
        tone: 'green',
        title: `Room ${room.room_number} reported to ${sent.join(' and ')}`,
        text: form.toMaintenance && form.setOutOfOrder && !held ? 'The room is now OUT OF ORDER until the repair is released.' : undefined,
      })
      setForm(EMPTY)
    } catch (err) {
      setResult({
        tone: 'red',
        title: sent.length ? `Sent to ${sent.join(' and ')}, but the rest failed` : 'Report not sent',
        text: err.message,
      })
    } finally {
      setBusy(false)
      reports.reload()
      rooms.reload()
    }
  }

  return (
    <div className="hk-grid">
      <Card title="Report room condition" subtitle="Send what you found in a room to Front Office, Maintenance, or both">
        <form className="hk-stack" onSubmit={send}>
          <div className="hk-form">
            <Field label="Room">
              <select value={form.roomId} onChange={set('roomId')}>
                <option value="">Select room</option>
                {rooms.data.rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>{r.room_number} · {r.room_type} ({label(r.room_status)})</option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={set('condition')}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
              </select>
            </Field>
            <Field label="What did you find?" wide>
              <textarea rows={3} maxLength={200} value={form.details} onChange={set('details')} placeholder="e.g. Broken lamp by the bed, bathroom towel rack loose" />
            </Field>
          </div>

          <fieldset className="hk-send-to">
            <legend>Send to</legend>
            <label className="hk-check hk-check--block">
              <input type="checkbox" checked={form.toFrontOffice} onChange={set('toFrontOffice')} />
              <span>
                <strong>Front Office</strong>
                <small>For guest charges, room moves, or holding the room from sale</small>
              </span>
            </label>
            <label className="hk-check hk-check--block">
              <input type="checkbox" checked={form.toMaintenance} onChange={set('toMaintenance')} />
              <span>
                <strong>Maintenance (Engineering)</strong>
                <small>For anything that needs repair</small>
              </span>
            </label>
          </fieldset>

          {form.toMaintenance && (
            <div className="hk-form">
              <Field label="Repair category">
                <select value={form.category} onChange={set('category')}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </Field>
              <Field label="Urgency">
                <select value={form.priority} onChange={set('priority')}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </Field>
              <label className="hk-check hk-field--wide">
                <input type="checkbox" checked={form.setOutOfOrder && !held} disabled={held} onChange={set('setOutOfOrder')} />
                Set room OUT OF ORDER until repaired
              </label>
              {held && (
                <div className="hk-field--wide">
                  <Notice tone="amber" title={`Room ${room.room_number} is ${label(room.room_status).toLowerCase()}`}>
                    Front Office has to move the guest before the room can be set out of order.
                  </Notice>
                </div>
              )}
            </div>
          )}

          {!form.toFrontOffice && !form.toMaintenance && (
            <Notice tone="amber" title="Choose where to send this report" />
          )}
          {result && <Notice tone={result.tone} title={result.title}>{result.text}</Notice>}
          <div className="hk-actions">
            <button type="button" className="hk-btn hk-btn--secondary" onClick={() => setForm(EMPTY)} disabled={busy}>Clear</button>
            <button type="submit" className="hk-btn hk-btn--primary" disabled={!ready || busy}>
              {busy ? 'Sending...' : 'Send report'}
            </button>
          </div>
        </form>
      </Card>

      <div className="hk-stack">
        <Card title="My recent reports" subtitle="What you sent and where it is now">
          <LoadState loading={reports.loading && !reports.data} error={reports.error} />
          {reports.data && (reports.data.reports.length ? (
            <ul className="hk-staff-list">
              {reports.data.reports.map((r) => (
                <li key={`${r.sent_to}-${r.id}`}>
                  <div>
                    <strong>Room {r.room_number} · {r.sent_to === 'FRONT_OFFICE' ? 'Front Office' : 'Maintenance'}</strong>
                    <small>{r.details}</small>
                    <small>{formatDateTime(r.reported_at)}</small>
                  </div>
                  <div className="hk-staff-list__side">
                    <Badge value={r.status === 'SEEN' ? 'COMPLETED' : r.status === 'SENT' ? 'OPEN' : r.status}>{label(r.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hk-muted">You haven't sent any reports yet.</p>
          ))}
        </Card>
        <Notice tone="violet" title="When to report">
          Report damage, missing items or anything unsafe as soon as you find it, before you finish cleaning the room.
          Found guest belongings go to Lost & Found instead.
        </Notice>
      </div>
    </div>
  )
}
