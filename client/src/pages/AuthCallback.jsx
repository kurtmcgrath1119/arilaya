import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { chooseRole, getSupabase } from '../supabase'
import './auth.css'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsRole, setNeedsRole] = useState(false)
  const [busyRole, setBusyRole] = useState('')

  const complete = useCallback(async (supabase, preferredRole) => {
    let { user } = await api('/api/auth/me')
    if (!user) throw new Error('Your account profile could not be loaded.')
    if (!user.role) {
      if (!preferredRole) {
        setNeedsRole(true)
        setLoading(false)
        return
      }
      await chooseRole(preferredRole)
      const profile = await api('/api/auth/me')
      user = profile.user
    }
    if (preferredRole && user.role !== preferredRole) {
      await supabase.auth.signOut()
      throw new Error(`This account is registered as a ${user.role}. Please choose ${user.role}.`)
    }
    if (user.role === 'admin') window.location.assign('/admin.html')
    else nav(user.role === 'seller' ? '/seller' : '/buyer', { replace: true })
  }, [nav])

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const supabase = await getSupabase()
        const { data } = await supabase.auth.getSession()
        let session = data.session
        const code = params.get('code')
        if (!session && code) {
          const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            const retry = await supabase.auth.getSession()
            session = retry.data.session
            if (!session) throw new Error(error.message)
          } else {
            session = exchanged.session
          }
        }
        if (!active) return
        if (!session) throw new Error('This sign-in link is invalid or has expired. Please try again.')
        const preferredRole = params.get('role') || sessionStorage.getItem('arilaya:oauth-role') || localStorage.getItem('arilaya:pending-role')
        const role = ['buyer', 'seller'].includes(preferredRole) ? preferredRole : null
        await complete(supabase, role)
        sessionStorage.removeItem('arilaya:oauth-role')
        localStorage.removeItem('arilaya:pending-role')
      } catch (err) {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      }
    }
    run()
    return () => { active = false }
  }, [params, nav, complete])

  const selectRole = async role => {
    setBusyRole(role)
    setError('')
    try {
      const supabase = await getSupabase()
      await chooseRole(role)
      localStorage.removeItem('arilaya:pending-role')
      sessionStorage.removeItem('arilaya:oauth-role')
      await complete(supabase, role)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyRole('')
    }
  }

  return (
    <main className="auth-callback" id="main-content" tabIndex={-1}>
      <section aria-labelledby="auth-callback-title">
        <span className="au-eyebrow">AriLaya</span>
        <h1 id="auth-callback-title">{needsRole ? 'Choose how you’ll use AriLaya' : loading ? 'Finishing sign-in…' : 'Sign-in problem'}</h1>
        {loading && <p role="status">Securely connecting your account.</p>}
        {needsRole && (
          <>
            <p>Choose your account type to continue. This cannot be changed from the dashboard.</p>
            <div className="auth-callback-actions">
              {['buyer', 'seller'].map(role => (
                <button type="button" key={role} disabled={Boolean(busyRole)} onClick={() => selectRole(role)}>
                  {busyRole === role ? 'Please wait…' : `I’m a ${role}`}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <div className="au-err" role="alert">{error}</div>}
        {!loading && !needsRole && <Link className="btn primary" to="/login">Return to log in</Link>}
      </section>
    </main>
  )
}
