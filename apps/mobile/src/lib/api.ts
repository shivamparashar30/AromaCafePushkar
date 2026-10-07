import { supabase } from './supabase'
import type { MenuItem, Order, StockItem, TableWithSession } from './types'

// ── Waiter APIs ──

export async function fetchWaiterTables(waiterId: string): Promise<TableWithSession[]> {
  // Get all tables with their open sessions (if any)
  const { data, error } = await supabase
    .from('tables')
    .select(`
      id, name, capacity, status,
      floor:floors(name),
      table_sessions!left(id, waiter_id, guest_count, status)
    `)
    .eq('is_active', true)
    // Counter slots are billing plumbing, not seats — a waiter must never see them.
    .eq('is_counter', false)
    // Retired tables keep their row so old bills resolve, but must not be seatable.
    .is('deleted_at', null)
    .order('name')

  if (error) throw error

  return (data ?? []).map((t) => {
    const openSession = (t.table_sessions as any[])?.find((s: any) => s.status === 'open')
    return {
      id: t.id,
      name: t.name,
      capacity: t.capacity,
      status: t.status,
      floor_name: (t.floor as any)?.name ?? '',
      session_id: openSession?.id ?? null,
      waiter_id: openSession?.waiter_id ?? null,
      guest_count: openSession?.guest_count ?? null,
    }
  })
}

export async function claimTable(tableId: string) {
  const { data, error } = await supabase.rpc('claim_table', { p_table_id: tableId })
  if (error) throw error
  return data
}

export async function lookupTableByQrToken(token: string): Promise<TableWithSession | null> {
  const { data, error } = await supabase
    .from('tables')
    .select(`
      id, name, capacity, status, qr_token,
      floor:floors(name),
      table_sessions!left(id, waiter_id, guest_count, status)
    `)
    // A retired table's QR must stop working, matching resolve_qr on the server, and a
    // counter slot's token is plumbing that was never meant to be scanned.
    .eq('is_counter', false)
    .is('deleted_at', null)
    .eq('qr_token', token)
    .eq('is_active', true)
    .single()

  if (error || !data) return null

  const openSession = (data.table_sessions as any[])?.find((s: any) => s.status === 'open')
  return {
    id: data.id,
    name: data.name,
    capacity: data.capacity,
    status: data.status,
    floor_name: (data.floor as any)?.name ?? '',
    session_id: openSession?.id ?? null,
    waiter_id: openSession?.waiter_id ?? null,
    guest_count: openSession?.guest_count ?? null,
  }
}

export async function fetchMenuForOrdering(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id, name, price, food_type, in_stock,
      category:categories(name),
      item_variants(id, name, price),
      addon_groups(id, name, min_select, max_select,
        addons(id, name, price)
      )
    `)
    .eq('is_active', true)
    .eq('in_stock', true)
    .order('name')

  if (error) throw error

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    food_type: item.food_type,
    in_stock: item.in_stock,
    category_name: (item.category as any)?.name ?? '',
    variants: (item.item_variants ?? []).map((v: any) => ({
      id: v.id,
      name: v.name,
      price: v.price,
    })),
    addon_groups: (item.addon_groups ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      addons: (g.addons ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        price: a.price,
      })),
    })),
  }))
}

export async function leaveTable(sessionId: string) {
  const { error } = await supabase.rpc('leave_table', { p_session_id: sessionId })
  if (error) throw error
}

export async function placeOrder(
  sessionId: string,
  items: { item_id: string; variant_id?: string; qty?: number; notes?: string; addon_ids?: string[] }[],
) {
  const { data, error } = await supabase.rpc('place_order', {
    p_session_id: sessionId,
    p_items: items,
  })
  if (error) throw error
  return data
}

export async function fetchSessionOrders(sessionId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, kot_number, status, source, placed_by_name, created_at,
      table_session:table_sessions(status, table:tables(name)),
      order_items(
        id, qty, unit_price, notes, status, station,
        menu_item:menu_items(name),
        variant:item_variants(name),
        order_item_addons(addon:addons(name, price))
      )
    `)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((o) => ({
    id: o.id,
    kot_number: o.kot_number,
    status: o.status,
    source: o.source,
    placed_by_name: (o as any).placed_by_name ?? null,
    created_at: o.created_at,
    table_name: (o.table_session as any)?.table?.name ?? '',
    items: (o.order_items ?? []).map((i: any) => ({
      id: i.id,
      qty: i.qty,
      unit_price: i.unit_price,
      notes: i.notes,
      status: i.status,
      menu_item_name: i.menu_item?.name ?? '',
      variant_name: i.variant?.name ?? null,
      station: i.station,
      addons: (i.order_item_addons ?? []).map((a: any) => ({
        name: a.addon?.name ?? '',
        price: a.addon?.price ?? 0,
      })),
    })),
  }))
}

export async function markItemServed(itemIds: string[]) {
  const { error } = await supabase.rpc('set_item_status', {
    p_item_ids: itemIds,
    p_status: 'served',
  })
  if (error) throw error
}

export async function createBill(sessionId: string) {
  const { data, error } = await supabase.rpc('create_bill', { p_session_id: sessionId })
  if (error) throw error
  return data
}

export async function callWaiterRpc(sessionId: string) {
  const { error } = await supabase.rpc('call_waiter', { p_session_id: sessionId })
  if (error) throw error
}

// ── Kitchen APIs ──

/**
 * A fully cancelled ticket would otherwise vanish the instant the last item is cancelled,
 * and a cook halfway through it would never find out. It stays on the board, struck
 * through, for this long so someone actually sees it.
 */
const CANCELLED_TICKET_GRACE_MS = 15 * 60 * 1000

export async function fetchKitchenOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, kot_number, status, source, placed_by_name, created_at, updated_at,
      table_session:table_sessions(status, table:tables(name), orders(id, created_at)),
      order_items(
        id, qty, unit_price, notes, status, station, cancel_reason,
        menu_item:menu_items(name, prep_minutes),
        variant:item_variants(name),
        order_item_addons(addon:addons(name, price))
      )
    `)
    // 'ready' stays on the board: a ready ticket is not finished work, it is work
    // waiting to be picked up. It leaves when a waiter marks it served (or when the
    // bill is paid, which mark_paid settles automatically).
    .in('status', ['placed', 'cooking', 'ready', 'cancelled'])
    .order('created_at', { ascending: true })

  if (error) throw error

  const cancelledCutoff = Date.now() - CANCELLED_TICKET_GRACE_MS

  return (data ?? [])
    // A closed session is done with, whatever its item statuses say. mark_paid settles
    // items on the way out, but this does not depend on that having worked: any row that
    // slips through (a session closed directly by a manager, or history predating that
    // fix) would otherwise sit on the board forever with no way to clear it.
    .filter((o) => (o.table_session as any)?.status === 'open')
    .filter((o) => o.status !== 'cancelled' || new Date((o as any).updated_at).getTime() >= cancelledCutoff)
    .map((o) => {
      // Position of this KOT among the table's rounds, so an add-on order reads as one
      // ("Table 5, round 2") rather than as a new table sitting down.
      const sessionOrders: { id: string; created_at: string }[] = (o.table_session as any)?.orders ?? []
      const seq = sessionOrders.filter((s) => s.created_at <= o.created_at).length

      return {
        id: o.id,
        kot_number: o.kot_number,
        status: o.status,
        source: o.source,
        placed_by_name: (o as any).placed_by_name ?? null,
        created_at: o.created_at,
        updated_at: (o as any).updated_at,
        table_name: (o.table_session as any)?.table?.name ?? '',
        session_kot_seq: Math.max(seq, 1),
        items: (o.order_items ?? []).map((i: any) => ({
          id: i.id,
          qty: i.qty,
          unit_price: i.unit_price,
          notes: i.notes,
          status: i.status,
          menu_item_name: i.menu_item?.name ?? '',
          variant_name: i.variant?.name ?? null,
          station: i.station,
          cancel_reason: i.cancel_reason ?? null,
          prep_minutes: i.menu_item?.prep_minutes ?? undefined,
          addons: (i.order_item_addons ?? []).map((a: any) => ({
            name: a.addon?.name ?? '',
            price: a.addon?.price ?? 0,
          })),
        })),
      }
    })
}

export async function markItemsCooking(itemIds: string[]) {
  const { error } = await supabase.rpc('set_item_status', {
    p_item_ids: itemIds,
    p_status: 'cooking',
  })
  if (error) throw error
}

export async function markItemsReady(itemIds: string[]) {
  const { error } = await supabase.rpc('set_item_status', {
    p_item_ids: itemIds,
    p_status: 'ready',
  })
  if (error) throw error
}

/**
 * Takes back a "ready" marked by mistake: items return to cooking, the waiter's ready alert
 * is withdrawn and they are told not to serve. The server refuses items already served.
 */
export async function recallItems(itemIds: string[]) {
  const { error } = await supabase.rpc('kitchen_recall_items', { p_item_ids: itemIds })
  if (error) throw error
}

/** Every active dish with its stock flag, for the kitchen's Stock tab. */
export async function fetchStockList(): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, food_type, station, in_stock, sort_order, category:categories(name, sort_order)')
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? [])
    .map((i: any) => ({
      id: i.id,
      name: i.name,
      food_type: i.food_type,
      station: i.station,
      in_stock: i.in_stock,
      category_name: i.category?.name ?? 'Other',
      _catSort: i.category?.sort_order ?? 0,
    }))
    .sort((a, b) => a._catSort - b._catSort || a.category_name.localeCompare(b.category_name))
    .map(({ _catSort, ...rest }) => rest)
}

/**
 * Flips a dish in or out of stock. Goes through an RPC because the kitchen may touch only
 * this one column of menu_items; place_order refuses out-of-stock items server-side.
 */
export async function setItemStock(itemId: string, inStock: boolean) {
  const { error } = await supabase.rpc('kitchen_set_item_stock', {
    p_item_id: itemId,
    p_in_stock: inStock,
  })
  if (error) throw error
}

/** Sends a short note about a ticket to that table's waiter (or all staff if unassigned). */
export async function messageWaiter(orderId: string, message: string) {
  const { error } = await supabase.rpc('kitchen_message_waiter', {
    p_order_id: orderId,
    p_message: message,
  })
  if (error) throw error
}

// ── Notifications ──

export async function fetchNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, event, payload, created_at, acknowledged_at')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data ?? []
}

export async function acknowledgeNotification(id: string, userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** The outlet's public identity, so no screen has to hard-code the restaurant name. */
export async function fetchOutletName(): Promise<string> {
  const { data, error } = await supabase.rpc('public_outlet_info')
  if (error) throw error
  return (data ?? [])[0]?.name ?? ''
}

export interface SessionBill {
  id: string
  bill_no: string | null
  status: string
  subtotal: number
  discount: number
  service_charge: number
  tax_total: number
  round_off: number
  total: number
  created_at: string
  /** Items added to the table after this bill was raised. */
  items_added_since: number
}

/**
 * The session's current bill, whoever raised it — waiter, cashier, admin or the customer
 * requesting it. The waiter app previously had no way to know a bill existed at all.
 *
 * Totals stay current by themselves: trg_order_items_refresh_bill recomputes an open bill
 * whenever items change. `items_added_since` is reported anyway so the waiter can see that
 * the table ordered more after the bill was printed.
 */
export async function fetchSessionBill(sessionId: string): Promise<SessionBill | null> {
  const { data, error } = await supabase
    .from('bills')
    .select('id, bill_no, status, subtotal, discount, service_charge, tax_total, round_off, total, created_at')
    .eq('session_id', sessionId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { count } = await supabase
    .from('order_items')
    .select('id, orders!inner(session_id)', { count: 'exact', head: true })
    .eq('orders.session_id', sessionId)
    .gt('created_at', data.created_at)
    .not('status', 'in', '("cancelled","wasted")')

  return { ...data, items_added_since: count ?? 0 }
}

/**
 * Cancels a single order item.
 *
 * The server decides who may do this and when: a waiter can cancel only while the item is
 * still 'ordered', because once the kitchen has started it the food exists and someone
 * has to account for it. From 'cooking' onwards it takes a manager or admin, and a manager
 * must give a reason. The UI mirrors that rule so a waiter is never offered an action the
 * server will refuse.
 */
export async function cancelItem(itemId: string, reason?: string) {
  const { error } = await supabase.rpc('cancel_item', {
    p_item_id: itemId,
    p_reason: reason?.trim() || undefined,
  })
  if (error) throw error
}

/**
 * Attaches a guest to a table session.
 *
 * A QR order captures name and phone up front, so that spend lands on the customer record.
 * An order taken by a waiter had no such step, so the sale was anonymous and never counted
 * toward the guest's visits or lifetime spend. Setting the phone fires the link trigger,
 * which creates or updates the customer and repoints this session's bills at them.
 */
export async function setSessionCustomer(sessionId: string, name: string, phone: string) {
  const { error } = await supabase.rpc('set_session_customer', {
    p_session_id: sessionId,
    p_name: name,
    p_phone: phone,
  })
  if (error) throw error
}

/** Digits only, at most ten. A pasted +91 is dropped, but only when that leaves more than
 *  ten digits — otherwise a genuine number like 9123456789 would be corrupted. */
export function clampPhone(value: string) {
  let digits = value.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
  return digits.slice(0, 10)
}

export function isValidPhone(value: string) {
  return /^[6-9]\d{9}$/.test(clampPhone(value))
}
