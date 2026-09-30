import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type AppRole = 'super_admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen'

export interface StaffProfile {
  id: string
  outlet_id: string
  name: string
  phone: string
  role: AppRole
  /** The outlet's own name, so nothing in the UI has to hard-code the restaurant. */
  outlet_name: string
}

interface AuthContextValue {
  session: Session | null
  profile: StaffProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function loadProfile(userId: string): Promise<StaffProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, outlet_id, name, phone, role:roles(name), outlet:outlets!profiles_outlet_id_fkey(name)')
    .eq('id', userId)
    .single()

  if (error) {
    // Silently returning null here left the app stuck on "Loading your profile…" with no
    // clue why. The reason belongs in the console.
    console.error('[auth] could not load staff profile:', error.message)
    return null
  }
  if (!data || !data.role) return null

  return {
    id: data.id,
    outlet_id: data.outlet_id,
    name: data.name,
    phone: data.phone,
    role: data.role.name as AppRole,
    outlet_name: (data as { outlet?: { name: string } | null }).outlet?.name ?? '',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function applySession(next: Session | null) {
      setSession(next)
      if (!next) {
        setProfile(null)
        return
      }
      const nextProfile = await loadProfile(next.user.id)
      if (!cancelled) setProfile(nextProfile)
    }

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
