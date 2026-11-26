import { createClient } from '@supabase/supabase-js'

let clientPromise

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch('/api/auth/config', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Authentication is not configured.')
        const config = await response.json()
        if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Authentication is not configured.')
        return createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
            storageKey: 'arilaya-auth'
          }
        })
      })
      .catch(error => {
        clientPromise = undefined
        throw error
      })
  }
  return clientPromise
}

export async function getAccessToken() {
  try {
    const supabase = await getSupabase()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  } catch {
    return null
  }
}

export async function chooseRole(role) {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('choose_role', { p_role: role })
  if (error) throw new Error(error.message)
}
