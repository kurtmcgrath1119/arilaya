import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { api } from '../api'
import { useAuth } from '../useAuth'
import Brand from '../Brand'
import './auth.css'

function Field({ label, type = 'text', value, onChange, autoComplete, minLength, inputMode }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="au-field">
      <input
        id={id}
        type={isPassword && visible ? 'text' : type}
        value={value}
        onChange={onChange}
        placeholder=" "
        autoComplete={autoComplete}
        minLength={minLength}
        inputMode={inputMode}
        required
      />
      <label htmlFor={id}>{label}</label>
      {isPassword && (
        <button
          type="button"
          className="au-password-toggle"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(current => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      )}
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

  const set = key => event => setF({ ...f, [key]: event.target.value })
  const switchMode = nextMode => { setMode(nextMode); setError('') }
  const done = user => { setUser(user); nav(user.role === 'seller' ? '/seller' : '/buyer') }

  async function submit(event) {
    event.preventDefault()
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
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle(response) {
    setError('')
    try {
      const { user } = await api('/api/auth/google', { method: 'POST', body: { credential: response.credential, role } })
      done(user)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="au" id="main-content" tabIndex={-1}>
      <Link to="/" className="au-back">&larr; Back to AriLaya</Link>

      <section className="au-form" aria-labelledby="auth-title">
        <div className={'au-box' + (reg ? ' wide' : '')}>
          <div key={mode} className="au-swap">
            <span className="au-eyebrow">{reg ? 'Join AriLaya' : 'Welcome back'}</span>
            <h1 id="auth-title" className="au-title">{reg ? 'Create your account' : 'Log in to AriLaya'}</h1>

            <div>
              <p className="au-lbl">I am a</p>
              <div className="au-roles" role="group" aria-label="Account type">
                {['buyer', 'seller'].map(item => (
                  <button
                    type="button"
                    key={item}
                    className={role === item ? 'on' : ''}
                    aria-pressed={role === item}
                    onClick={() => setRole(item)}
                  >
                    {item === 'buyer' ? 'Buyer' : 'Seller'}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={submit}>
              {reg && (
                <fieldset className="au-fieldset">
                  <legend className="au-sec">Personal details</legend>
                  <div className="au-row">
                    <Field label="First Name" value={f.firstName} onChange={set('firstName')} autoComplete="given-name" />
                    <Field label="Last Name" value={f.lastName} onChange={set('lastName')} autoComplete="family-name" />
                  </div>
                  <Field label="Contact Number" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" />
                  <div className="au-hint">Mobile number, for example 09171234567</div>
                </fieldset>
              )}
              {reg && (
                <fieldset className="au-fieldset">
                  <legend className="au-sec">Address</legend>
                  <Field label="House No. / Street / Purok" value={f.street} onChange={set('street')} autoComplete="address-line1" />
                  <div className="au-row">
                    <Field label="Barangay" value={f.barangay} onChange={set('barangay')} />
                    <Field label="City / Municipality" value={f.city} onChange={set('city')} autoComplete="address-level2" />
                  </div>
                  <Field label="Province" value={f.province} onChange={set('province')} autoComplete="address-level1" />
                  <span className="au-sec">Account</span>
                </fieldset>
              )}

              <Field label="E-mail" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
              {reg ? (
                <>
                  <div className="au-row">
                    <Field label="Password" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} />
                    <Field label="Confirm Password" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" minLength={8} />
                  </div>
                  <div className="au-hint">Use at least 8 characters.</div>
                </>
              ) : (
                <Field label="Password" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" />
              )}

              {reg && (
                <label className="au-terms">
                  <input type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)} />
                  I accept the terms of the agreement and allow AriLaya to store my details
                </label>
              )}
              {error && <div className="au-err" role="alert">{error}</div>}
              <button className="au-btn" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Log in'}</button>
            </form>
          </div>

          <div className="au-or"><span>or continue with</span></div>
          <div className="au-g">
            {clientId === null && <span className="au-lbl">Loading Google sign-in…</span>}
            {clientId === '' && <span className="au-err">Google sign-in isn’t set up yet.</span>}
            {clientId && (
              <GoogleOAuthProvider clientId={clientId}>
                <GoogleLogin onSuccess={onGoogle} onError={() => setError('Google sign-in failed.')}
                  text={reg ? 'signup_with' : 'signin_with'} width="280" />
              </GoogleOAuthProvider>
            )}
          </div>
        </div>
      </section>

      <section className="au-side" aria-label="About AriLaya">
        <div className="au-side-in">
          <Brand inverted />
          <div key={mode} className="au-side-swap">
            <span className="au-side-eyebrow">Mamburao, Occidental Mindoro</span>
            <h2>{reg ? 'Your next move starts here.' : 'Good to see you again.'}</h2>
            <p>{reg ? 'Create one account to discover land, save your favorite lots, or publish a listing.' : 'Pick up where you left off and continue exploring or managing your lots.'}</p>
            <ul className="au-benefits">
              <li>Browse admin-reviewed listings</li>
              <li>View lot boundaries and photos</li>
              <li>Save lots and manage your dashboard</li>
            </ul>
            <button type="button" className="au-ghost" onClick={() => switchMode(reg ? 'login' : 'register')}>
              {reg ? 'I already have an account' : 'Create an account'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
