import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import './auth.css'

function Field({ label, type = 'text', value, onChange, autoComplete, minLength, inputMode }) {
  return (
    <div className="au-field">
      <input type={type} value={value} onChange={onChange} placeholder=" "
        autoComplete={autoComplete} minLength={minLength} inputMode={inputMode} required />
      <label>{label}</label>
    </div>
  )
}

function PinIcon() {
  return (
    <div className="au-pin-wrap" aria-hidden="true">
      <svg className="au-pin" viewBox="0 0 120 150">
        <path d="M60 4 C30 4 8 27 8 56 C8 90 44 116 60 146 C76 116 112 90 112 56 C112 27 90 4 60 4 Z" fill="#fff" />
        <circle cx="60" cy="56" r="28" fill="#1b3a2f" />
        <circle cx="60" cy="56" r="11" fill="#8dc63f" />
      </svg>
      <span className="au-pin-shadow" />
    </div>
  )
}

const BLANK = {
  firstName: '', lastName: '', email: '', phone: '',
  street: '', barangay: '', city: 'Mamburao', province: 'Occidental Mindoro',
  password: '', confirm: ''
}
const PHONE = /^(09|\+639)\d{9}$/

export default function Login() {
  const [params] = useSearchParams()
  const [role, setRole] = useState(params.get('role') === 'seller' ? 'seller' : 'buyer')
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login')
  const [f, setF] = useState(BLANK)
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState(null)
  const { setUser } = useAuth()
  const nav = useNavigate()
  const reg = mode === 'register'

  useEffect(() => {
    api('/api/auth/config').then(d => setClientId(d.googleClientId)).catch(() => setClientId(''))
  }, [])

  const set = k => e => setF({ ...f, [k]: e.target.value })
  const switchMode = m => { setMode(m); setError('') }
  const done = user => { setUser(user); nav(user.role === 'seller' ? '/seller' : '/buyer') }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (reg) {
      if (!PHONE.test(f.phone.replace(/[\s-]/g, ''))) return setError('Enter a valid mobile number, like 09171234567.')
      if (f.password !== f.confirm) return setError('Passwords do not match.')
      if (!agree) return setError('Please accept the terms of the agreement.')
    }
    setBusy(true)
    try {
      const body = reg
        ? { ...f, confirm: undefined, role }
        : { email: f.email, password: f.password, role }
      const { user } = await api(reg ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body })
      done(user)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  async function onGoogle(resp) {
    setError('')
    try {
      const { user } = await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential, role } })
      done(user)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="au">
      <Link to="/" className="au-back">&lt; Home Page</Link>

      <section className="au-form">
        <div className={'au-box' + (reg ? ' wide' : '')}>
          <div key={mode} className="au-swap">
            <h1 className="au-title">{reg ? 'Create Account' : 'Log In'}</h1>

            <div>
              <p className="au-lbl">I am a</p>
              <div className="au-roles" role="group" aria-label="Account type">
                {['buyer', 'seller'].map(r => (
                  <button type="button" key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                    {r === 'buyer' ? 'Buyer' : 'Seller'}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={submit}>
              {reg && (
                <div>
                  <div className="au-sec" style={{ marginTop: 0 }}>Personal details</div>
                  <div className="au-row">
                    <Field label="First Name" value={f.firstName} onChange={set('firstName')} autoComplete="given-name" />
                    <Field label="Last Name" value={f.lastName} onChange={set('lastName')} autoComplete="family-name" />
                  </div>
                  <Field label="Contact Number" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" />
                  <div className="au-hint">Mobile number, for example 09171234567</div>
                </div>
              )}
              {reg && (
                <div>
                  <div className="au-sec">Address</div>
                  <Field label="House No. / Street / Purok" value={f.street} onChange={set('street')} autoComplete="address-line1" />
                  <div className="au-row">
                    <Field label="Barangay" value={f.barangay} onChange={set('barangay')} />
                    <Field label="City / Municipality" value={f.city} onChange={set('city')} autoComplete="address-level2" />
                  </div>
                  <Field label="Province" value={f.province} onChange={set('province')} autoComplete="address-level1" />
                  <div className="au-sec">Account</div>
                </div>
              )}

              <Field label="E-mail" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
              {reg ? (
                <div className="au-row">
                  <Field label="Password" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} />
                  <Field label="Confirm Password" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" minLength={8} />
                </div>
              ) : (
                <Field label="Password" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" />
              )}
              {reg && <div className="au-hint">At least 8 characters</div>}

              {reg && (
                <label className="au-terms">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                  I accept the terms of the agreement and allow AriLaya to store my details
                </label>
              )}
              {error && <div className="au-err">{error}</div>}
              <button className="au-btn" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Sign up' : 'Log in'}</button>
            </form>
          </div>

          <div className="au-or">or</div>
          <div className="au-g">
            {clientId === null && <span className="au-lbl">Loading Google sign-in…</span>}
            {clientId === '' && <span className="au-err">Google sign-in isn’t set up yet.</span>}
            {clientId && (
              <GoogleOAuthProvider clientId={clientId}>
                <GoogleLogin onSuccess={onGoogle} onError={() => setError('Google sign-in failed.')}
                  text={reg ? 'signup_with' : 'signin_with'} width="300" />
              </GoogleOAuthProvider>
            )}
          </div>
        </div>
      </section>

      <section className="au-side">
        <div className="au-side-in">
          <PinIcon />
          <div key={mode} className="au-side-swap">
            <h2>{reg ? 'Get Started' : 'Welcome Back'}</h2>
            <p>{reg ? 'Already have an account?' : 'New to AriLaya?'}</p>
            <button type="button" className="au-ghost" onClick={() => switchMode(reg ? 'login' : 'register')}>
              {reg ? 'Log in' : 'Create account'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}