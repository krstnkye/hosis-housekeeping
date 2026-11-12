import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox, Stat } from '../components/ui.jsx'
import { formatDateTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const CATEGORIES = ['LINEN', 'AMENITY', 'CLEANING_SUPPLY']
const MOVE_TEXT = { IN: 'Stock in', OUT: 'Stock out', ADJUST: 'Stock count' }

const EXPORT_COLUMNS = [
  { title: 'Item', value: (i) => i.item_name },
  { title: 'Category', value: (i) => label(i.category) },
  { title: 'On hand', value: (i) => `${i.quantity} ${i.unit}` },
  { title: 'Reorder at', value: (i) => i.reorder_level },
  { title: 'Used today', value: (i) => i.used_today },
  { title: 'Storage', value: (i) => i.storage_area || '' },
  { title: 'Status', value: (i) => (i.quantity === 0 ? 'Out of stock' : i.low_stock ? 'Low stock' : 'OK') },
]

function StockLevel({ item }) {
  const pct = Math.min(100, Math.round((item.quantity / Math.max(item.reorder_level * 2, 1)) * 100))
  const toneName = item.quantity === 0 ? 'red' : item.low_stock ? 'amber' : 'green'
  return (
    <span className="hk-stock">
      <strong>{item.quantity}</strong> {item.unit}
      <span className={`hk-stock__bar hk-stock__bar--${toneName}`} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </span>
  )
}

function stockBadge(item) {
  if (item.quantity === 0) return <Badge value="OUT_OF_ORDER">Out of stock</Badge>
  if (item.low_stock) return <Badge value="DIRTY">Low stock</Badge>
  return <Badge value="AVAILABLE">OK</Badge>
}

// Inventory: linen, guest amenities and cleaning supplies. Staff record what
// they take or return; supervisors add items and record stock counts.
export default function InventoryPage({ user }) {
  const supervisor = user.position === 'SUPERVISOR' || user.role === 'ADMIN'
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState(null)
  const query = `?${new URLSearchParams({ ...(category && { category }), ...(lowOnly && { low: '1' }) })}`
  const items = useLoad(() => api.inventory(query), [query])
  const rooms = useLoad(() => api.rooms(), [], { refresh: false })

  const q = search.toLowerCase()
  const list = (items.data?.items || []).filter((i) => !q || `${i.item_name} ${i.storage_area || ''}`.toLowerCase().includes(q))
  const selected = list.find((i) => i.inv_item_id === selectedId) || list[0]
  const s = items.data?.summary

  function done(message, itemId) {
    setFlash(message)
    setAdding(false)
    if (itemId) setSelectedId(itemId)
    items.reload()
  }

  return (
    <div className="hk-stack">
      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
      {s && (
        <div className="hk-stats">
          <Stat title="ITEMS TRACKED" value={s.items} note="Linen, amenities and supplies" />
          <Stat title="LOW STOCK" value={s.low_stock} note="At or below the reorder level" valueTone={s.low_stock ? 'amber' : undefined} />
          <Stat title="OUT OF STOCK" value={s.out_of_stock} note="Reorder now" valueTone={s.out_of_stock ? 'red' : undefined} />
        </div>
      )}
      <div className="hk-grid">
        <Card
          title="Stock on hand"
          subtitle="Select an item to record stock in or out"
          actions={
            <div className="hk-actions">
              <ExportMenu title="Housekeeping Inventory" fileName="housekeeping-inventory" columns={EXPORT_COLUMNS} rows={list} />
              {supervisor && <button type="button" className="hk-btn hk-btn--primary" onClick={() => setAdding(true)}>+ Add item</button>}
            </div>
          }
        >
          <div className="hk-toolbar hk-toolbar--wrap">
            <div className="hk-chips" role="group" aria-label="Category">
              {['', ...CATEGORIES].map((c) => (
                <button key={c || 'all'} type="button" className={`hk-chip${category === c ? ' is-active' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {c ? label(c) : 'All'}
                </button>
              ))}
            </div>
            <label className="hk-check">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              Low stock only
            </label>
          </div>
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search item or storage area" />
          </div>
          <LoadState loading={items.loading && !items.data} error={items.error} />
          <DataTable
            rowKey="inv_item_id"
            rows={list}
            selectedKey={selected?.inv_item_id}
            onSelect={(i) => setSelectedId(i.inv_item_id)}
            darkHover
            empty="No items match."
            columns={[
              { key: 'name', title: 'Item', render: (i) => <span><strong>{i.item_name}</strong><small className="hk-block">{label(i.category)}</small></span> },
              { key: 'qty', title: 'On hand', render: (i) => <StockLevel item={i} /> },
              { key: 'reorder', title: 'Reorder at', render: (i) => i.reorder_level },
              { key: 'status', title: 'Status', render: stockBadge },
            ]}
          />
        </Card>

        <div className="hk-stack">
          {selected ? (
            <>
              <MoveForm key={selected.inv_item_id} item={selected} rooms={rooms.data?.rooms || []} supervisor={supervisor} onDone={done} />
              <Movements item={selected} />
            </>
          ) : (
            <Card title="Item"><p className="hk-muted">No item selected.</p></Card>
          )}
        </div>
      </div>

      {adding && (
        <Modal title="Add inventory item" onClose={() => setAdding(false)}>
          <NewItemForm onDone={done} />
        </Modal>
      )}
    </div>
  )
}

function MoveForm({ item, rooms, supervisor, onDone }) {
  const [type, setType] = useState('OUT')
  const [form, setForm] = useState({ quantity: '', roomId: '', remarks: '' })
  const [reorder, setReorder] = useState(String(item.reorder_level))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const types = supervisor ? ['OUT', 'IN', 'ADJUST'] : ['OUT', 'IN']
  const qty = Number(form.quantity)
  const ready = form.quantity !== '' && Number.isInteger(qty) && (type === 'ADJUST' ? qty >= 0 && form.remarks.trim() : qty > 0)

  async function run(action, message) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone(message, item.inv_item_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(
      () => api.moveStock(item.inv_item_id, { type, quantity: qty, roomId: form.roomId || null, remarks: form.remarks || null }),
      {
        tone: 'green',
        title: type === 'ADJUST' ? `${item.item_name} count saved: ${qty} ${item.unit}` : `${MOVE_TEXT[type]} recorded: ${qty} ${item.unit} of ${item.item_name}`,
      }
    )

  return (
    <Card title={item.item_name} subtitle={`${label(item.category)}${item.storage_area ? ` · ${item.storage_area}` : ''}`} actions={stockBadge(item)}>
      <dl className="hk-facts">
        <dt>On hand</dt><dd><strong>{item.quantity}</strong> {item.unit}</dd>
        <dt>Reorder at</dt><dd>{item.reorder_level} {item.unit}</dd>
        <dt>Used today</dt><dd>{item.used_today} {item.unit}</dd>
      </dl>
      <h3 className="hk-subhead">Record stock</h3>
      <div className="hk-chips" role="group" aria-label="Movement type">
        {types.map((t) => (
          <button key={t} type="button" className={`hk-chip${type === t ? ' is-active' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}>
            {MOVE_TEXT[t]}
          </button>
        ))}
      </div>
      <div className="hk-form">
        <Field label={type === 'ADJUST' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`}>
          <input type="number" min={type === 'ADJUST' ? 0 : 1} step="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} />
        </Field>
        {type === 'OUT' ? (
          <Field label="Room (optional)">
            <select value={form.roomId} onChange={set('roomId')}>
              <option value="">Not for a room</option>
              {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_number} · {r.room_type}</option>)}
            </select>
          </Field>
        ) : (
          <span />
        )}
        <Field label={type === 'ADJUST' ? 'Reason for the count' : 'Remarks (optional)'} wide>
          <input
            value={form.remarks}
            onChange={set('remarks')}
            maxLength={255}
            placeholder={type === 'IN' ? 'e.g. Laundry return, delivery' : type === 'OUT' ? 'e.g. Room turnover' : 'e.g. Monthly count, damaged linen'}
          />
        </Field>
      </div>
      {type === 'ADJUST' && <p className="hk-muted">A stock count replaces the quantity on hand with what was counted. The difference is recorded.</p>}
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !ready} onClick={save}>
          Save {MOVE_TEXT[type].toLowerCase()}
        </button>
      </div>
      {supervisor && (
        <>
          <h3 className="hk-subhead">Item settings</h3>
          <div className="hk-form">
            <Field label={`Reorder level (${item.unit})`}>
              <input type="number" min="0" step="1" value={reorder} onChange={(e) => setReorder(e.target.value)} />
            </Field>
          </div>
          <div className="hk-actions">
            <button
              type="button"
              className="hk-btn hk-btn--secondary"
              disabled={busy || reorder === '' || Number(reorder) === item.reorder_level}
              onClick={() => run(() => api.updateInventoryItem(item.inv_item_id, { reorderLevel: Number(reorder) }), { tone: 'green', title: `${item.item_name} reorder level set to ${reorder}.` })}
            >
              Save reorder level
            </button>
            <button
              type="button"
              className="hk-btn hk-btn--secondary"
              disabled={busy}
              onClick={() => run(() => api.updateInventoryItem(item.inv_item_id, { active: false }), { tone: 'green', title: `${item.item_name} removed from the list.`, text: 'Its stock history is kept.' })}
            >
              Remove item
            </button>
          </div>
        </>
      )}
    </Card>
  )
}

// OUT is shown as taken away; a stock count shows the difference it made.
function signed(m) {
  if (m.movement_type === 'OUT') return `-${m.quantity}`
  return m.quantity >= 0 ? `+${m.quantity}` : String(m.quantity)
}

function Movements({ item }) {
  const moves = useLoad(() => api.inventoryMovements(`?itemId=${item.inv_item_id}&limit=15`), [item.inv_item_id, item.quantity])
  return (
    <Card title="Recent stock movements" subtitle="Latest 15 for this item">
      <LoadState loading={moves.loading && !moves.data} error={moves.error} />
      <ul className="hk-feed">
        {(moves.data?.movements || []).map((m) => (
          <li key={m.movement_id}>
            <Badge value={m.movement_type === 'IN' ? 'AVAILABLE' : m.movement_type === 'OUT' ? 'DIRTY' : 'IN_PROGRESS'}>{MOVE_TEXT[m.movement_type]}</Badge>{' '}
            <strong>{signed(m)} {m.unit}</strong>
            {m.room_number ? ` · Room ${m.room_number}` : ''} · balance {m.balance_after}
            <small className="hk-block">{formatDateTime(m.moved_at)} · {m.staff_name}{m.remarks ? ` · ${m.remarks}` : ''}</small>
          </li>
        ))}
        {moves.data && !moves.data.movements.length && <li className="hk-muted">No movements yet.</li>}
      </ul>
    </Card>
  )
}

function NewItemForm({ onDone }) {
  const [form, setForm] = useState({ itemName: '', category: 'LINEN', unit: 'pcs', quantity: '0', reorderLevel: '0', storageArea: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { item } = await api.createInventoryItem({ ...form, quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel) })
      onDone({ tone: 'green', title: `${item.item_name} added to inventory.` }, item.inv_item_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add inventory item" subtitle="The starting quantity is recorded as opening stock">
      <div className="hk-form">
        <Field label="Item name" wide><input value={form.itemName} onChange={set('itemName')} maxLength={100} placeholder="e.g. Bath mat" /></Field>
        <Field label="Category">
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field label="Unit"><input value={form.unit} onChange={set('unit')} maxLength={20} placeholder="pcs, bottles, liters" /></Field>
        <Field label="Starting quantity"><input type="number" min="0" step="1" value={form.quantity} onChange={set('quantity')} /></Field>
        <Field label="Reorder level"><input type="number" min="0" step="1" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
        <Field label="Storage area" wide><input value={form.storageArea} onChange={set('storageArea')} maxLength={100} placeholder="e.g. Linen room - Floor 1" /></Field>
      </div>
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !form.itemName.trim() || !form.unit.trim()} onClick={save}>Add item</button>
      </div>
    </Card>
  )
}
