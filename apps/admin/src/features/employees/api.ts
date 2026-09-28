import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/features/auth/AuthProvider'

export interface StaffMember {
  id: string
  name: string
  phone: string
  role: AppRole
  is_active: boolean
  joining_date: string
  assigned_areas: string[]
}

export interface StaffDevice {
  id: string
  platform: string
  device_identifier: string
  last_seen: string | null
  revoked_at: string | null
}

export async function fetchStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, is_active, joining_date, assigned_areas, role:roles(name)')
    .order('name')

  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    role: (p.role as { name: string }).name as AppRole,
    is_active: p.is_active,
    joining_date: p.joining_date,
    assigned_areas: p.assigned_areas ?? [],
  }))
}

export async function fetchStaffDevices(staffId: string): Promise<StaffDevice[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('id, platform, device_identifier, last_seen, revoked_at')
    .eq('user_id', staffId)
    .order('last_seen', { ascending: false, nullsFirst: false })

  if (error) throw error
  return data ?? []
}

export async function revokeDevice(deviceId: string) {
  const { error } = await supabase
    .from('devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', deviceId)
  if (error) throw error
}

export async function unrevokeDevice(deviceId: string) {
  const { error } = await supabase
    .from('devices')
    .update({ revoked_at: null })
    .eq('id', deviceId)
  if (error) throw error
}

// Staff mutations go through the manage-staff Edge Function (needs service_role for auth.users)

async function callManageStaff(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json
}

export interface CreateStaffInput {
  name: string
  phone: string
  role: AppRole
  pin: string
  email?: string
  password?: string
  assigned_areas?: string[]
}

export async function createStaff(input: CreateStaffInput) {
  return callManageStaff({ action: 'create', ...input })
}

export interface UpdateStaffInput {
  staff_id: string
  name?: string
  phone?: string
  role?: AppRole
  assigned_areas?: string[]
}

export async function updateStaff(input: UpdateStaffInput) {
  return callManageStaff({ action: 'update', ...input })
}

export async function resetPin(staffId: string, newPin: string) {
  return callManageStaff({ action: 'reset_pin', staff_id: staffId, new_pin: newPin })
}

export async function toggleStaffActive(staffId: string, isActive: boolean) {
  return callManageStaff({ action: 'toggle_active', staff_id: staffId, is_active: isActive })
}
