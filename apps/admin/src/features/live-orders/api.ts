import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/database.types'

export type OrderItemStatus = Database['public']['Enums']['order_item_status']
export type PaymentMode = Database['public']['Enums']['payment_mode']

export interface SessionDetail {
  session: {
    id: string
    table_id: string
    waiter_id: string | null
    status: string
    guest_count: number | null
    opened_at: string
    customer_name: string | null
    customer_phone: string | null
  } | null
  table: { id: string; name: string; status: string }
  orders: {
    id: string
    kot_number: number
    source: string
    placed_by_name: string | null
    status: string
    created_at: string
    items: {
      id: string
      qty: number
      unit_price: number
      notes: string | null
      status: OrderItemStatus
      item_name: string
      variant_name: string | null
      addon_names: string[]
    }[]
  }[]
  bill: {
    id: string
    subtotal: number
    discount: number
    service_charge: number
    tax_total: number
    round_off: number
    total: number
    status: string
    bill_no: string | null
  } | null
  payments: { id: string; mode: PaymentMode; amount: number; reference: string | null }[]
}

export async function fetchSessionDetail(tableId: string): Promise<SessionDetail> {
  const { data: table, error: tErr } = await supabase
    .from('tables')
    .select('id, name, status')
    .eq('id', tableId)
    .single()
  if (tErr) throw tErr

  const { data: session, error: sErr } = await supabase
    .from('table_sessions')
    .select('id, table_id, waiter_id, status, guest_count, opened_at, customer_name, customer_phone')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .maybeSingle()
  if (sErr) throw sErr

  if (!session) {
    return { session: null, table, orders: [], bill: null, payments: [] }
  }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select(
      `id, kot_number, source, placed_by_name, status, created_at,
       order_items(id, qty, unit_price, notes, status,
         menu_items(name), item_variants(name),
         order_item_addons(addons(name)))`,
    )
    .eq('session_id', session.id)
    .order('kot_number')
  if (oErr) throw oErr

  const { data: bill, error: bErr } = await supabase
    .from('bills')
    .select('id, subtotal, discount, service_charge, tax_total, round_off, total, status, bill_no')
    .eq('session_id', session.id)
    .eq('status', 'open')
    .maybeSingle()
  if (bErr) throw bErr

  let payments: SessionDetail['payments'] = []
  if (bill) {
    const { data: p, error: pErr } = await supabase
      .from('payments')
      .select('id, mode, amount, reference')
      .eq('bill_id', bill.id)
    if (pErr) throw pErr
    payments = p ?? []
  }

  return {
    session,
    table,
    orders: (orders ?? []).map((o) => ({
      id: o.id,
      kot_number: o.kot_number,
      source: o.source,
      placed_by_name: o.placed_by_name ?? null,
      status: o.status,
      created_at: o.created_at,
      items: o.order_items.map((oi) => ({
        id: oi.id,
        qty: oi.qty,
        unit_price: oi.unit_price,
        notes: oi.notes,
        status: oi.status,
        item_name: oi.menu_items?.name ?? 'Unknown item',
        variant_name: oi.item_variants?.name ?? null,
        addon_names: oi.order_item_addons.map((a) => a.addons?.name).filter((n): n is string => !!n),
      })),
    })),
    bill,
    payments,
  }
}

export interface PlaceOrderItem {
  item_id: string
  variant_id?: string
  qty: number
  notes?: string
  addon_ids?: string[]
}

export async function placeOrder(sessionId: string, items: PlaceOrderItem[]) {
  const { error } = await supabase.rpc('place_order', {
    p_session_id: sessionId,
    p_items: items as unknown as Json,
  })
  if (error) throw error
}

export async function claimTable(tableId: string) {
  const { error } = await supabase.rpc('claim_table', { p_table_id: tableId })
  if (error) throw error
}

export async function cancelItem(itemId: string, reason: string) {
  const { error } = await supabase.rpc('cancel_item', { p_item_id: itemId, p_reason: reason || undefined })
  if (error) throw error
}

/** Closes out a ready item once it has reached the table. Also what takes the ticket
 *  off the kitchen display. */
export async function markItemServed(itemId: string) {
  const { error } = await supabase.rpc('set_item_status', {
    p_item_ids: [itemId],
    p_status: 'served',
  })
  if (error) throw error
}

export async function createBill(sessionId: string) {
  const { error } = await supabase.rpc('create_bill', { p_session_id: sessionId })
  if (error) throw error
}

export async function applyDiscount(billId: string, discountPaise: number, reason: string) {
  const { error } = await supabase.rpc('apply_discount', {
    p_bill_id: billId,
    p_discount: discountPaise,
    p_reason: reason || undefined,
  })
  if (error) throw error
}

export async function addPayment(billId: string, mode: PaymentMode, amountPaise: number, reference?: string) {
  const { error } = await supabase.rpc('add_payment', {
    p_bill_id: billId,
    p_mode: mode,
    p_amount: amountPaise,
    p_reference: reference || undefined,
  })
  if (error) throw error
}

export async function markPaid(billId: string) {
  const { error } = await supabase.rpc('mark_paid', { p_bill_id: billId })
  if (error) throw error
}

export async function voidBill(billId: string, reason: string) {
  const { error } = await supabase.rpc('void_bill', { p_bill_id: billId, p_reason: reason })
  if (error) throw error
}

export async function freeTable(sessionId: string) {
  const { error } = await supabase.rpc('leave_table', { p_session_id: sessionId })
  if (error) throw error
}

/**
 * Item ids that have variants or add-on groups, so the picker knows which items need
 * the options step and which can be added to the draft in a single click.
 */
export async function fetchItemsWithOptions(): Promise<Set<string>> {
  const [{ data: variants, error: vErr }, { data: groups, error: gErr }] = await Promise.all([
    supabase.from('item_variants').select('item_id').eq('is_active', true),
    supabase.from('addon_groups').select('item_id'),
  ])
  if (vErr) throw vErr
  if (gErr) throw gErr

  return new Set([
    ...(variants ?? []).map((v) => v.item_id),
    ...(groups ?? []).map((g) => g.item_id),
  ])
}
