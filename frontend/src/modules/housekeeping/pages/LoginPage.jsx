import { useState } from 'react'
import { api, saveSession } from '../api.js'
import Logo from '../components/Logo.jsx'
import { Notice } from '../components/ui.jsx'

// Housekeeping Staff Login (flowchart: Log In -> Authorized? -> Access Denied / Dashboard).
export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '', department: 'HOUSEKEEPING' })
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await api.login(form)
      saveSession(session, remember)
      onLogin(session)
      window.location.hash = '#/housekeeping/overview'
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hk-login">
      <header className="hk-login__banner">
        <Logo size={56} />
        <div>
          <span className="hk-login__hotel">Grand Horizon Hotel</span>
          <span className="hk-login__tag">Stay · Relax · Belong</span>
        </div>
      </header>

      <div className="hk-login__frame">
        <div className="hk-login__hero" aria-hidden="true">
          <div className="hk-login__hero-mark">
            <Logo size={140} />
            <span>Grand Horizon Hotel</span>
            <small>Stay · Relax · Belong</small>
          </div>
        </div>

        <form className="hk-login__card" onSubmit={submit}>
          <h1>Housekeeping Staff Login</h1>
          <p className="hk-muted">Sign in with your staff username and password.</p>

          {error && (
            <Notice tone="red" title={error.status === 403 ? 'Access denied - unauthorized account' : 'Login failed'}>
              {error.status === 403
                ? 'Only active Housekeeping accounts can open this module. Contact your supervisor or the system administrator.'
                : error.message}
            </Notice>
          )}

          <label className="hk-field">
            <span className="hk-field__label">Staff username</span>
            <input value={form.username} onChange={set('username')} autoComplete="username" required />
          </label>

          <label className="hk-field">
            <span className="hk-field__label">Password</span>
            <span className="hk-password">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="hk-password__toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>

          <label className="hk-field">
            <span className="hk-field__label">Department</span>
            <select value={form.department} onChange={set('department')}>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </select>
          </label>

          <label className="hk-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>

          <button type="submit" className="hk-btn hk-btn--primary hk-btn--block" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          <p className="hk-login__forgot">Forgot password? Ask the system administrator to reset it.</p>
        </form>
      </div>
    </div>
  )
}
