import { useEffect, useState } from 'react'
import { api } from './api'
import { AuthContext } from './authContext'
import { getSupabase } from './supabase'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const hydrate = async () => {
      try {
        const supabase = await getSupabase()
        const { data } = await supabase.auth.getSession()
        if (!active) return
        if (!data.session) {
          setUser(null)
          return
        }
        const profile = await api('/api/auth/me')
        if (active) setUser(profile.user)
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    hydrate()
    let subscription
    getSupabase().then(supabase => {
      if (!active) return
      subscription = supabase.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          return
        }
        if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
          window.setTimeout(hydrate, 0)
        }
      }).data.subscription
    }).catch(() => {})

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const logout = async () => {
    try {
      const supabase = await getSupabase()
      await supabase.auth.signOut()
    } finally {
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, setUser, loading, logout }}>{children}</AuthContext.Provider>
}
