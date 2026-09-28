import { supabase } from './supabase'

export type StaffRole = 'super_admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen'

export interface StaffProfile {
  id: string
  outlet_id: string
  name: string
  phone: string
  role: StaffRole
}

export async function loginWithPin(
  phone: string,
  pin: string,
  deviceIdentifier: string,
  platform: 'android_waiter' | 'android_kitchen',
) {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/staff-pin-login`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ phone, pin, device_identifier: deviceIdentifier, platform }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Login failed')

  // Set the session in the supabase client so it persists
  await supabase.auth.setSession({
    access_token: json.session.access_token,
    refresh_token: json.session.refresh_token,
  })

  return json
}

export async function loadProfile(userId: string): Promise<StaffProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, outlet_id, name, phone, role:roles(name)')
    .eq('id', userId)
    .single()

  if (error || !data || !data.role) return null
  return {
    id: data.id,
    outlet_id: data.outlet_id,
    name: data.name,
    phone: data.phone,
    role: (data.role as { name: string }).name as StaffRole,
  }
}

export async function signOut() {
  await supabase.auth.signOut()
}
