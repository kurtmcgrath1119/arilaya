import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabase } from '../supabase'
import './auth.css'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    getSupabase().then(async supabase => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (!data.session) setError('This reset link is invalid or has expired. Request a new one.')
      setReady(true)
    }).catch(err => {
      if (active) {
        setError(err.message)
        setReady(true)
      }
    })
    return () => { active = false }
  }, [])

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      const supabase = await getSupabase()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error(updateError.message)
      setDone(true)
      await supabase.auth.signOut()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-callback" id="main-content" tabIndex={-1}>
      <section aria-labelledby="reset-title">
        <span className="au-eyebrow">AriLaya account recovery</span>
        <h1 id="reset-title">{done ? 'Password updated' : 'Choose a new password'}</h1>
        {done ? (
          <>
            <p role="status">Your password has been changed. You can now log in with it.</p>
            <Link className="btn primary" to="/login">Go to log in</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="au-field">
              <input id="reset-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required placeholder=" " />
              <label htmlFor="reset-password">New password</label>
            </div>
            <div className="au-field">
              <input id="reset-confirm" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required placeholder=" " />
              <label htmlFor="reset-confirm">Confirm new password</label>
            </div>
            {error && <div className="au-err" role="alert">{error}</div>}
            <button className="au-btn" disabled={!ready || busy}>{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
