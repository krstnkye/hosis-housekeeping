import { useState } from 'react'
import { api } from '../api.js'
import { Card, DataTable, Field, LoadState, Notice, Pagination } from '../components/ui.jsx'
import { formatDateTime, label, staffId } from '../format.js'
import { useLoad } from '../useLoad.js'
import { usePagination } from '../usePagination.js'

// Staff Accounts (supervisors): handle "Forgot password" requests and set a
// temporary password for a team member. The temporary password is shown once;
// give it to the staff member in person. They must choose a new password the
// next time they sign in.
const EMPTY_STAFF = { firstName: '', lastName: '', username: '', email: '', position: 'HOUSEKEEPER' }

export default function StaffAccountsPage({ user }) {
  const requests = useLoad(() => api.passwordResets(), [])
  const staff = useLoad(() => api.staff(), [], { refresh: false })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [newStaff, setNewStaff] = useState(EMPTY_STAFF)

  function setNew(field) {
    return (e) => setNewStaff({ ...newStaff, [field]: e.target.value })
  }

  async function createStaff(e) {
    e.preventDefault()
    setBusy('create')
    setError(null)
    setResult(null)
    try {
      const res = await api.createStaffAccount(newStaff)
      setResult({
        created: true,
        name: res.staff.name,
        username: res.staff.username,
        email: res.staff.email,
        password: res.temporaryPassword,
      })
      setNewStaff(EMPTY_STAFF)
      staff.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function reset(person) {
    setBusy(person.user_id)
    setError(null)
    setResult(null)
    setConfirm(null)
    try {
      const res = await api.resetStaffPassword(person.user_id)
      setResult({ name: res.staff.name, username: res.staff.username, password: res.temporaryPassword })
      requests.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(r) {
    setBusy(r.user_id)
    setError(null)
    try {
      await api.dismissReset(r.reset_id)
      requests.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const pending = requests.data?.requests || []
  const team = (staff.data?.staff || []).filter((s) => s.user_id !== user.userId)
  const requestPage = usePagination(pending, 5)
  const teamPage = usePagination(team, 10)

  return (
    <div className="hk-stack">
      {result && (
        <Notice tone="green" title={result.created ? `Account created for ${result.name}` : `Temporary password for ${result.name}`}>
          <p>
            Give this to {result.name} ({result.username}) in person. It is shown only once:
          </p>
          <p className="hk-temp-password" aria-label="Temporary password">{result.password}</p>
          <p>They will be asked to choose their own password when they sign in. Any device they were signed in on is signed out.</p>
        </Notice>
      )}
      {error && <Notice tone="red" title="Not done">{error}</Notice>}

      <Card title="Create staff account" subtitle="Supervisor approval is recorded by creating the account here">
        <form className="hk-stack" onSubmit={createStaff}>
          <div className="hk-form">
            <Field label="First name">
              <input required maxLength={50} value={newStaff.firstName} onChange={setNew('firstName')} autoComplete="off" />
            </Field>
            <Field label="Last name">
              <input required maxLength={50} value={newStaff.lastName} onChange={setNew('lastName')} autoComplete="off" />
            </Field>
            <Field label="Username">
              <input required minLength={3} maxLength={50} value={newStaff.username} onChange={setNew('username')} placeholder="e.g. hk.ana" autoComplete="off" />
            </Field>
            <Field label="Work email">
              <input required type="email" maxLength={100} value={newStaff.email} onChange={setNew('email')} placeholder="name@grandhorizon.ph" autoComplete="off" />
            </Field>
            <Field label="Position" wide>
              <select value={newStaff.position} onChange={setNew('position')}>
                <option value="HOUSEKEEPER">Housekeeper</option>
                <option value="INSPECTOR">Inspector</option>
                <option value="SUPERVISOR">Supervisor</option>
              </select>
            </Field>
          </div>
          <p className="hk-muted">The employee receives a one-time password and must choose a private password at first sign-in.</p>
          <div className="hk-actions">
            <button type="submit" className="hk-btn hk-btn--primary" disabled={busy === 'create'}>
              {busy === 'create' ? 'Creating account…' : 'Create staff account'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Forgot password requests" subtitle="Sent from the login page">
        <LoadState loading={requests.loading && !requests.data} error={requests.error} />
        <DataTable
          rowKey="reset_id"
          rows={requestPage.rows}
          empty="No one is waiting for a password reset."
          columns={[
            { key: 'name', title: 'Staff', render: (r) => <span><strong>{r.name}</strong><small className="hk-block">{r.email || r.username}</small></span> },
            { key: 'pos', title: 'Position', render: (r) => label(r.position) },
            { key: 'at', title: 'Asked', render: (r) => formatDateTime(r.requested_at) },
            {
              key: 'act',
              title: 'Action',
              render: (r) => (
                <span className="hk-actions hk-actions--tight">
                  <button type="button" className="hk-btn hk-btn--primary hk-btn--small" disabled={busy === r.user_id} onClick={() => reset(r)}>
                    Set temporary password
                  </button>
                  <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" disabled={busy === r.user_id} onClick={() => dismiss(r)}>
                    Dismiss
                  </button>
                </span>
              ),
            },
          ]}
        />
        <Pagination {...requestPage.pagination} itemLabel="password requests" />
        <p className="hk-muted">Dismiss a request if the staff member says they did not ask for it.</p>
      </Card>

      <Card title="Housekeeping team" subtitle="Reset a password without a request, e.g. when someone is locked out">
        <LoadState loading={staff.loading && !staff.data} error={staff.error} />
        <DataTable
          rowKey="user_id"
          rows={teamPage.rows}
          columns={[
            { key: 'id', title: 'User ID', render: (s) => staffId(s.user_id) },
            { key: 'name', title: 'Name', render: (s) => <span><strong>{s.name}</strong><small className="hk-block">{s.email || s.username}</small></span> },
            { key: 'pos', title: 'Position', render: (s) => label(s.position) },
            {
              key: 'act',
              title: 'Password',
              render: (s) =>
                confirm === s.user_id ? (
                  <span className="hk-actions hk-actions--tight">
                    <button type="button" className="hk-btn hk-btn--primary hk-btn--small" disabled={busy === s.user_id} onClick={() => reset(s)}>
                      Yes, reset
                    </button>
                    <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" onClick={() => setConfirm(s.user_id)}>
                    Reset password
                  </button>
                ),
            },
          ]}
        />
        <Pagination {...teamPage.pagination} itemLabel="staff accounts" />
      </Card>
    </div>
  )
}
