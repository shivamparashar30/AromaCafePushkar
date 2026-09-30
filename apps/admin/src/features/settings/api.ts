import { supabase } from '@/lib/supabase'
import { getMyOutletId } from '@/lib/outlet'

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
    oid = await getMyOutletId()
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
  const outletId = await getMyOutletId()

  const { error } = await supabase
    .from('outlets')
    .update(input)
    .eq('id', outletId)
  if (error) throw error
}

export async function updateOutletSettings(settings: OutletSettings['settings']) {
  const outletId = await getMyOutletId()

  const { error } = await supabase
    .from('outlets')
    .update({ settings })
    .eq('id', outletId)
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
  const outletId = await getMyOutletId()

  const { error } = await supabase.from('tax_groups').insert({
    outlet_id: outletId,
    ...input,
  })
  if (error) throw error
}

export async function updateTaxGroup(id: string, input: Partial<{ name: string; cgst_percent: number; sgst_percent: number; is_active: boolean }>) {
  const { error } = await supabase.from('tax_groups').update(input).eq('id', id)
  if (error) throw error
}
