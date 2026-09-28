import { supabase } from './supabase'
import type { MenuItem, Order, TableWithSession } from './types'

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
      id, kot_number, status, source, created_at,
      table_session:table_sessions(table:tables(name)),
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

export async function fetchKitchenOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, kot_number, status, source, created_at,
      table_session:table_sessions(table:tables(name)),
      order_items(
        id, qty, unit_price, notes, status, station,
        menu_item:menu_items(name),
        variant:item_variants(name),
        order_item_addons(addon:addons(name, price))
      )
    `)
    .in('status', ['placed', 'cooking'])
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((o) => ({
    id: o.id,
    kot_number: o.kot_number,
    status: o.status,
    source: o.source,
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
