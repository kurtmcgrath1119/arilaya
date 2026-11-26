import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../useAuth'
import { chooseRole, getSupabase } from '../supabase'
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
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(null)
  const { setUser } = useAuth()
  const nav = useNavigate()
  const reg = mode === 'register'
  const forgot = mode === 'forgot'

  useEffect(() => {
    api('/api/auth/config').then(config => setGoogleConfigured(config.googleConfigured)).catch(() => setGoogleConfigured(false))
  }, [])

  const set = key => event => setF({ ...f, [key]: event.target.value })
  const switchMode = nextMode => {
    setMode(nextMode)
    setError('')
    setNotice('')
  }
  const done = user => {
    setUser(user)
    if (user.role === 'admin') window.location.assign('/admin.html')
    else nav(user.role === 'seller' ? '/seller' : '/buyer')
  }

  const finishSession = async preferredRole => {
    const supabase = await getSupabase()
    let { user } = await api('/api/auth/me')
    if (!user) throw new Error('Your session could not be loaded. Please try again.')
    if (!user.role) {
      await chooseRole(preferredRole)
      const profile = await api('/api/auth/me')
      user = profile.user
    }
    if (preferredRole && user.role !== preferredRole) {
      await supabase.auth.signOut()
      throw new Error(`This account is registered as a ${user.role}. Please choose ${user.role}.`)
    }
    done(user)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (forgot) {
      setBusy(true)
      try {
        const supabase = await getSupabase()
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(f.email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        })
        if (resetError) throw new Error(resetError.message)
        setNotice('If that email has an account, a password reset link is on its way.')
      } catch (err) {
        setError(err.message && err.message !== '{}'
          ? err.message
          : 'We could not send a reset link. Please try again.')
      } finally {
        setBusy(false)
      }
      return
    }
    if (reg) {
      if (!PHONE.test(f.phone.replace(/[\s-]/g, ''))) return setError('Enter a valid mobile number, like 09171234567.')
      if (f.password !== f.confirm) return setError('Passwords do not match.')
      if (!agree) return setError('Please accept the terms of the agreement.')
    }
    setBusy(true)
    try {
      const supabase = await getSupabase()
      if (reg) {
        localStorage.setItem('arilaya:pending-role', role)
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: f.email.trim(),
          password: f.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              first_name: f.firstName.trim(),
              last_name: f.lastName.trim(),
              phone: f.phone.trim(),
              street: f.street.trim(),
              barangay: f.barangay.trim(),
              city: f.city.trim(),
              province: f.province.trim()
            }
          }
        })
        if (signUpError) throw new Error(signUpError.message)
        if (!data.session) {
          setNotice('Check your email to confirm your account, then return here to log in.')
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: f.email.trim(),
          password: f.password
        })
        if (signInError) throw new Error(signInError.message)
      }
      await finishSession(role)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const supabase = await getSupabase()
      sessionStorage.setItem('arilaya:oauth-role', role)
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      })
      if (oauthError) throw new Error(oauthError.message)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <main className="au" id="main-content" tabIndex={-1}>
      <Link to="/" className="au-back">&larr; Back to AriLaya</Link>

      <section className="au-form" aria-labelledby="auth-title">
        <div className={'au-box' + (reg ? ' wide' : '')}>
          <div key={mode} className="au-swap">
            <span className="au-eyebrow">{reg ? 'Join AriLaya' : forgot ? 'Account recovery' : 'Welcome back'}</span>
            <h1 id="auth-title" className="au-title">{reg ? 'Create your account' : forgot ? 'Reset your password' : 'Log in to AriLaya'}</h1>

            {!forgot && (
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
            )}

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
              ) : !forgot && (
                <Field label="Password" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" />
              )}

              {reg && (
                <label className="au-terms">
                  <input type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)} />
                  I accept the terms of the agreement and allow AriLaya to store my details
                </label>
              )}
              {error && <div className="au-err" role="alert">{error}</div>}
              {notice && <div className="au-ok" role="status">{notice}</div>}
              <button className="au-btn" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : forgot ? 'Send reset link' : 'Log in'}</button>
            </form>

            {!reg && !forgot && (
              <button type="button" className="au-linkbtn" onClick={() => switchMode('forgot')}>Forgot password?</button>
            )}
            {forgot && (
              <button type="button" className="au-linkbtn" onClick={() => switchMode('login')}>Back to log in</button>
            )}
          </div>

          {!forgot && (
            <>
              <div className="au-or"><span>or continue with</span></div>
              <div className="au-g">
                {googleConfigured === null && <span className="au-lbl">Loading Google sign-in…</span>}
                {googleConfigured === false && <span className="au-hint">Google sign-in isn’t set up yet.</span>}
                {googleConfigured && (
                  <button type="button" className="au-google" onClick={onGoogle} disabled={busy}>Continue with Google</button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="au-side" aria-label="About AriLaya">
        <div className="au-side-in">
          <Brand inverted />
          <div key={mode} className="au-side-swap">
            <span className="au-side-eyebrow">Mamburao, Occidental Mindoro</span>
            <h2>{reg ? 'Your next move starts here.' : forgot ? 'Let’s get you back in.' : 'Good to see you again.'}</h2>
            <p>{reg ? 'Create one account to discover land, save your favorite lots, or publish a listing.' : forgot ? 'We’ll email you a secure link to choose a new password.' : 'Pick up where you left off and continue exploring or managing your lots.'}</p>
            <ul className="au-benefits">
              <li>Browse admin-reviewed listings</li>
              <li>View lot boundaries and photos</li>
              <li>Save lots and manage your dashboard</li>
            </ul>
            {!forgot && (
              <button type="button" className="au-ghost" onClick={() => switchMode(reg ? 'login' : 'register')}>
                {reg ? 'I already have an account' : 'Create an account'}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
