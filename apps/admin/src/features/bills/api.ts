import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type BillStatus = Database['public']['Enums']['bill_status']

export interface BillRow {
  id: string
  bill_no: string | null
  status: BillStatus
  subtotal: number
  discount: number
  service_charge: number
  tax_total: number
  total: number
  created_at: string
  table_name: string
  waiter_name: string | null
}

export interface BillFilters {
  from?: string
  to?: string
  status?: BillStatus | 'all'
}

export async function fetchBills(filters: BillFilters): Promise<BillRow[]> {
  let query = supabase
    .from('bills')
    .select(
      'id, bill_no, status, subtotal, discount, service_charge, tax_total, total, created_at, table_sessions(tables(name), profiles(name))',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((b) => ({
    id: b.id,
    bill_no: b.bill_no,
    status: b.status,
    subtotal: b.subtotal,
    discount: b.discount,
    service_charge: b.service_charge,
    tax_total: b.tax_total,
    total: b.total,
    created_at: b.created_at,
    table_name: b.table_sessions?.tables?.name ?? '—',
    waiter_name: b.table_sessions?.profiles?.name ?? null,
  }))
}

export interface BillDetail extends BillRow {
  round_off: number
  void_reason: string | null
  payments: { id: string; mode: string; amount: number; reference: string | null }[]
  items: { id: string; name: string; variant_name: string | null; qty: number; unit_price: number; status: string }[]
}

export async function fetchBillDetail(billId: string): Promise<BillDetail> {
  const { data: bill, error } = await supabase
    .from('bills')
    .select(
      'id, bill_no, status, subtotal, discount, service_charge, tax_total, round_off, total, void_reason, created_at, session_id, table_sessions(tables(name), profiles(name))',
    )
    .eq('id', billId)
    .single()
  if (error) throw error

  const [{ data: payments }, { data: orders }] = await Promise.all([
    supabase.from('payments').select('id, mode, amount, reference').eq('bill_id', billId),
    supabase
      .from('orders')
      .select('order_items(id, qty, unit_price, status, menu_items(name), item_variants(name))')
      .eq('session_id', bill.session_id),
  ])

  const items = (orders ?? []).flatMap((o) =>
    o.order_items.map((oi) => ({
      id: oi.id,
      name: oi.menu_items?.name ?? 'Unknown item',
      variant_name: oi.item_variants?.name ?? null,
      qty: oi.qty,
      unit_price: oi.unit_price,
      status: oi.status,
    })),
  )

  return {
    id: bill.id,
    bill_no: bill.bill_no,
    status: bill.status,
    subtotal: bill.subtotal,
    discount: bill.discount,
    service_charge: bill.service_charge,
    tax_total: bill.tax_total,
    round_off: bill.round_off,
    total: bill.total,
    void_reason: bill.void_reason,
    created_at: bill.created_at,
    table_name: bill.table_sessions?.tables?.name ?? '—',
    waiter_name: bill.table_sessions?.profiles?.name ?? null,
    payments: payments ?? [],
    items,
  }
}

export async function voidBillWithReason(billId: string, reason: string) {
  const { error } = await supabase.rpc('void_bill', { p_bill_id: billId, p_reason: reason })
  if (error) throw error
}
