import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type TableStatus = Database['public']['Enums']['table_status']

export interface FloorWithTables {
  id: string
  name: string
  sort_order: number
  tables: {
    id: string
    name: string
    capacity: number
    status: TableStatus
    is_active: boolean
    qr_token: string
  }[]
}

export async function fetchFloors(): Promise<FloorWithTables[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('id, name, sort_order, tables(id, name, capacity, status, is_active, qr_token)')
    .order('sort_order')

  if (error) throw error
  return (data ?? []).map((f) => ({
    ...f,
    tables: [...f.tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  }))
}

export async function createFloor(name: string) {
  const { data: outlet } = await supabase.from('profiles').select('outlet_id').single()
  if (!outlet) throw new Error('No profile found for current user')

  const { data: maxSort } = await supabase
    .from('floors')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('floors').insert({
    outlet_id: outlet.outlet_id,
    name,
    sort_order: (maxSort?.sort_order ?? 0) + 1,
  })
  if (error) throw error
}

export async function renameFloor(id: string, name: string) {
  const { error } = await supabase.from('floors').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteFloor(id: string) {
  const { error } = await supabase.from('floors').delete().eq('id', id)
  if (error) throw error
}

export interface TableInput {
  name: string
  floor_id: string
  capacity: number
}

export async function createTable(input: TableInput) {
  const { data: outlet } = await supabase.from('profiles').select('outlet_id').single()
  if (!outlet) throw new Error('No profile found for current user')

  const { error } = await supabase.from('tables').insert({
    outlet_id: outlet.outlet_id,
    floor_id: input.floor_id,
    name: input.name,
    capacity: input.capacity,
    qr_token: crypto.randomUUID().replace(/-/g, ''),
  })
  if (error) throw error
}

export async function updateTable(id: string, input: Partial<TableInput & { is_active: boolean }>) {
  const { error } = await supabase.from('tables').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteTable(id: string) {
  const { error } = await supabase.from('tables').delete().eq('id', id)
  if (error) throw error
}

export async function regenerateTableQr(id: string) {
  const { error } = await supabase
    .from('tables')
    .update({ qr_token: crypto.randomUUID().replace(/-/g, '') })
    .eq('id', id)
  if (error) throw error
}
