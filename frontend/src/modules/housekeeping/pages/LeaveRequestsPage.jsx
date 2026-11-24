import { useMemo, useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice, Pagination } from '../components/ui.jsx'
import { longDate, label } from '../format.js'
import { useLoad } from '../useLoad.js'
import { usePagination } from '../usePagination.js'

const TYPES = ['VACATION', 'SICK', 'EMERGENCY', 'BEREAVEMENT', 'MATERNITY', 'PATERNITY', 'OTHER']
function isoAfter(days) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10) }
const EMPTY = { type: 'VACATION', startDate: isoAfter(1), endDate: isoAfter(1), reason: '' }

export default function LeaveRequestsPage() {
  const records = useLoad(() => api.leaveRequests(), [])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const page = usePagination(records.data?.requests || [], 10)
  const days = useMemo(() => { const start=Date.parse(`${form.startDate}T00:00:00Z`), end=Date.parse(`${form.endDate}T00:00:00Z`); return Number.isFinite(start)&&Number.isFinite(end)&&end>=start ? Math.round((end-start)/86400000)+1 : 0 }, [form.startDate, form.endDate])
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  async function submit(event) { event.preventDefault(); if(!days||!form.reason.trim())return; setBusy(true);setMessage(null);try{await api.createLeaveRequest({...form,reason:form.reason.trim()});setForm({...EMPTY,startDate:isoAfter(1),endDate:isoAfter(1)});setMessage({tone:'green',title:'Leave request sent to Human Resources'});records.reload()}catch(error){setMessage({tone:'red',title:'Leave request not sent',text:error.message})}finally{setBusy(false)} }
  async function withdraw(id){if(!window.confirm('Withdraw this pending leave request?'))return;setBusy(true);try{await api.withdrawLeaveRequest(id);setMessage({tone:'green',title:'Leave request withdrawn'});records.reload()}catch(error){setMessage({tone:'red',title:'Request not withdrawn',text:error.message})}finally{setBusy(false)}}
  return <div className="hk-stack"><div className="hk-grid"><Card title="Request leave" subtitle="Human Resources reviews the request and returns its decision here"><form className="hk-stack" onSubmit={submit}><div className="hk-form"><Field label="Leave type"><select value={form.type} onChange={set('type')}>{TYPES.map(type=><option key={type} value={type}>{label(type)}</option>)}</select></Field><Field label="Start date"><input type="date" min={isoAfter(0)} value={form.startDate} onChange={set('startDate')} /></Field><Field label="End date"><input type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} /></Field><Field label="Reason for leave" wide><textarea rows={4} maxLength={500} value={form.reason} onChange={set('reason')} placeholder="Explain why you are requesting leave" /></Field></div><p className="hk-footnote">{days?`${days} calendar day${days===1?'':'s'}`:'Choose a valid date range.'}</p>{message&&<Notice tone={message.tone} title={message.title}>{message.text}</Notice>}<div className="hk-actions"><button className="hk-btn hk-btn--primary" disabled={busy||!days||!form.reason.trim()}>{busy?'Sending...':'Send to HR'}</button></div></form></Card><Notice tone="violet" title="How approval works">Your request is visible only to you and authorized Human Resources staff. Approved dates immediately appear in your leave history.</Notice></div><Card title="My leave requests" subtitle="Pending and completed decisions from Human Resources"><LoadState loading={records.loading&&!records.data} error={records.error}/>{records.data&&<><DataTable rowKey="id" rows={page.rows} empty="You have not submitted a leave request." columns={[{key:'id',title:'Reference',render:r=><strong>{r.public_reference||r.id}</strong>},{key:'type',title:'Type',render:r=>label(r.type)},{key:'dates',title:'Dates',render:r=><span>{longDate(r.start_date)}<small className="hk-block">to {longDate(r.end_date)} · {r.days} day{r.days===1?'':'s'}</small></span>},{key:'reason',title:'Reason',render:r=>r.reason},{key:'status',title:'HR decision',render:r=><span><Badge value={r.status.toUpperCase()}>{label(r.status)}</Badge>{r.decision_notes&&<small className="hk-block">{r.decision_notes}</small>}</span>},{key:'action',title:'Action',render:r=>r.status==='PENDING'?<button type="button" className="hk-btn hk-btn--secondary" disabled={busy} onClick={()=>withdraw(r.id)}>Withdraw</button>:null}]} /><Pagination {...page.pagination} itemLabel="leave requests" alwaysShow/></>}</Card></div>
}
