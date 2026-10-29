import { useState } from 'react'
import { api, saveSession } from '../api.js'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { Notice } from '../components/ui.jsx'
import logoBanner from '../assets/logo-banner.png'
import hotelRoom from '../assets/hotel-room.jpg'

const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
const EYE_OFF = 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2'

// Housekeeping Staff Login (flowchart: Log In -> Authorized? -> Access Denied / Dashboard).
export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '', department: 'HOUSEKEEPING' })
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState({})
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (e.target.value) setMissing({ ...missing, [field]: false })
  }

  async function submit(e) {
    e.preventDefault()
    const empty = { username: !form.username.trim(), password: !form.password }
    setMissing(empty)
    if (empty.username || empty.password) return
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
        <img src={logoBanner} alt="Grand Horizon Hotel - Stay, Relax, Belong" />
      </header>

      <div className="hk-login__frame">
        <img className="hk-login__hero" src={hotelRoom} alt="" />

        <form className="hk-login__card" onSubmit={submit} noValidate>
          <h1>Housekeeping Staff Login</h1>
          <p className="hk-muted">Sign in with your authorized hotel staff account.</p>

          {error && error.status !== 403 && (
            <Notice tone="red" title="Login failed">
              {error.message}
            </Notice>
          )}

          <label className={`hk-field${missing.username ? ' is-invalid' : ''}`}>
            <span className="hk-field__label">Staff username</span>
            <input
              type="text"
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              placeholder="TabudloHK@gmail.com"
              aria-invalid={missing.username || undefined}
              aria-describedby={missing.username ? 'login-email-error' : undefined}
            />
            {missing.username && <span className="hk-field__error" id="login-email-error">Staff username is required</span>}
          </label>

          <label className={`hk-field${missing.password ? ' is-invalid' : ''}`}>
            <span className="hk-field__label">Password</span>
            <span className="hk-password">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                placeholder="Enter password"
                aria-invalid={missing.password || undefined}
                aria-describedby={missing.password ? 'login-password-error' : undefined}
              />
              <button
                type="button"
                className="hk-password__toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon d={showPassword ? EYE : EYE_OFF} size={22} />
              </button>
            </span>
            {missing.password && <span className="hk-field__error" id="login-password-error">Please enter your password.</span>}
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
          <button type="button" className="hk-login__forgot" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>
            Forgot password?
          </button>
          {forgot && <p className="hk-muted hk-login__hint">Ask the system administrator to reset your password.</p>}
        </form>
      </div>

      {error?.status === 403 && (
        <Modal title="Access Denied" onClose={() => setError(null)} variant="denied">
          <div className="hk-denied">
            <span className="hk-denied__icon" aria-hidden="true">
              <Icon d="M4 4h7v7H4zM4 14h7v6H4zM14 14h6v6h-6zM14 4l6 6M20 4l-6 6" size={20} />
            </span>
            <strong>Access Denied</strong>
          </div>
          <p className="hk-denied__title">Unauthorized account — session ended</p>
          <p className="hk-muted">Housekeeping access was not granted. This sign-in attempt has ended.</p>
          <button
            type="button"
            className="hk-btn hk-btn--primary hk-btn--block"
            onClick={() => {
              setError(null)
              setForm({ ...form, username: '', password: '' })
            }}
          >
            Back to sign in
          </button>
        </Modal>
      )}
    </div>
  )
}
