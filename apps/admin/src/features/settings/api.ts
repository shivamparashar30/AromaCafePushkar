import { supabase } from '@/lib/supabase'

export interface OutletSettings {
  id: string
  name: string
  address: string | null
  gstin: string | null
  fssai: string | null
  settings: {
    ordering?: {
      user_ordering?: boolean
      online_ordering?: boolean
      online_payment?: boolean
      first_order_needs_confirmation?: boolean
      allow_direct_table_takeover?: boolean
    }
    service_charge?: {
      enabled?: boolean
      percent?: number
    }
    tax?: {
      enabled?: boolean
      percent?: number
    }
    default_discount?: {
      enabled?: boolean
      percent?: number
    }
    bill_prefix?: string
  } | null
}

export async function fetchOutletSettings(outletId?: string): Promise<OutletSettings> {
  let oid = outletId
  if (!oid) {
    const { data: profile } = await supabase.from('profiles').select('outlet_id').single()
    if (!profile) throw new Error('No profile found for current user')
    oid = profile.outlet_id
  }

  const { data, error } = await supabase
    .from('outlets')
    .select('id, name, address, gstin, fssai, settings')
    .eq('id', oid)
    .single()

  if (error) throw error
  return data as OutletSettings
}

export async function updateOutletDetails(input: {
  name?: string
  address?: string
  gstin?: string
  fssai?: string
}) {
  const { data: profile } = await supabase.from('profiles').select('outlet_id').single()
  if (!profile) throw new Error('No profile found for current user')

  const { error } = await supabase
    .from('outlets')
    .update(input)
    .eq('id', profile.outlet_id)
  if (error) throw error
}

export async function updateOutletSettings(settings: OutletSettings['settings']) {
  const { data: profile } = await supabase.from('profiles').select('outlet_id').single()
  if (!profile) throw new Error('No profile found for current user')

  const { error } = await supabase
    .from('outlets')
    .update({ settings })
    .eq('id', profile.outlet_id)
  if (error) throw error
}

export interface TaxGroup {
  id: string
  name: string
  cgst_percent: number
  sgst_percent: number
  is_active: boolean
}

export async function fetchTaxGroups(): Promise<TaxGroup[]> {
  const { data, error } = await supabase
    .from('tax_groups')
    .select('id, name, cgst_percent, sgst_percent, is_active')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createTaxGroup(input: { name: string; cgst_percent: number; sgst_percent: number }) {
  const { data: profile } = await supabase.from('profiles').select('outlet_id').single()
  if (!profile) throw new Error('No profile found for current user')

  const { error } = await supabase.from('tax_groups').insert({
    outlet_id: profile.outlet_id,
    ...input,
  })
  if (error) throw error
}

export async function updateTaxGroup(id: string, input: Partial<{ name: string; cgst_percent: number; sgst_percent: number; is_active: boolean }>) {
  const { error } = await supabase.from('tax_groups').update(input).eq('id', id)
  if (error) throw error
}
