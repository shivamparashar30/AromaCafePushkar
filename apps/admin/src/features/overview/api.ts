import { supabase } from '@/lib/supabase'

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface OverviewData {
  todaySalesPaise: number
  ordersToday: number
  avgBillPaise: number
  coversToday: number
  tablesFree: number
  tablesOccupied: number
  tablesTotal: number
  ordersInKitchen: number
  pendingPayments: number
  salesByHour: { hour: number; amountPaise: number }[]
  topDishes: { name: string; qty: number; revenuePaise: number }[]
  salesByCategory: { name: string; revenuePaise: number }[]
  paymentModeSplit: { mode: string; amountPaise: number }[]
  trend7d: { bucket: string; netPaise: number }[]
  floorMap: { floorName: string; tables: { id: string; name: string; status: string }[] }[]
  slowOrders: { table: string; minutes: number }[]
  billRequestedTables: string[]
  whatsappFailedCount: number
}

export async function fetchOverview(): Promise<OverviewData> {
  const since = startOfToday()

  const [
    billsToday,
    tablesRes,
    sessionsToday,
    ordersToday,
    orderItemsToday,
    paymentsToday,
    trendRes,
    slowItemsRes,
    whatsappFailedRes,
  ] = await Promise.all([
    supabase.from('bills').select('total, status, created_at').gte('created_at', since),
    // Counter slots are billing plumbing, not seats: they must not appear on the floor
    // map or skew the free/occupied counts. Retired tables are excluded for the same
    // reason they are everywhere else -- the row only survives for historical bills.
    supabase
      .from('tables')
      .select('id, name, status, floor_id, floors(name, sort_order)')
      .eq('is_counter', false)
      .is('deleted_at', null),
    supabase.from('table_sessions').select('guest_count').gte('opened_at', since),
    supabase.from('orders').select('id, status').gte('created_at', since),
    supabase
      .from('order_items')
      .select('qty, unit_price, status, created_at, menu_items(name, categories(name))')
      .gte('created_at', since),
    supabase.from('payments').select('mode, amount').gte('created_at', since),
    supabase.rpc('report_sales', { p_from: daysAgo(6), p_to: today(), p_group_by: 'day' }),
    supabase
      .from('order_items')
      .select('status, created_at, orders(table_sessions(tables(name)))')
      .in('status', ['ordered', 'cooking']),
    supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ])

  const paidToday = (billsToday.data ?? []).filter((b) => b.status === 'paid')
  const openToday = (billsToday.data ?? []).filter((b) => b.status === 'open')
  const todaySalesPaise = paidToday.reduce((sum, b) => sum + Number(b.total), 0)
  const avgBillPaise = paidToday.length > 0 ? Math.round(todaySalesPaise / paidToday.length) : 0

  const tables = tablesRes.data ?? []
  const tablesFree = tables.filter((t) => t.status === 'free').length
  const tablesOccupied = tables.filter((t) => t.status !== 'free').length

  const coversToday = (sessionsToday.data ?? []).reduce((sum, s) => sum + (s.guest_count ?? 0), 0)

  const ordersInKitchen = (ordersToday.data ?? []).filter((o) =>
    ['placed', 'cooking'].includes(o.status),
  ).length

  const salesByHourMap = new Map<number, number>()
  for (const b of paidToday) {
    const hour = new Date(b.created_at).getHours()
    salesByHourMap.set(hour, (salesByHourMap.get(hour) ?? 0) + Number(b.total))
  }
  const salesByHour = Array.from(salesByHourMap.entries())
    .map(([hour, amountPaise]) => ({ hour, amountPaise }))
    .sort((a, b) => a.hour - b.hour)

  const dishMap = new Map<string, { qty: number; revenuePaise: number }>()
  const categoryMap = new Map<string, number>()
  for (const item of orderItemsToday.data ?? []) {
    if (item.status === 'cancelled') continue
    const name = item.menu_items?.name ?? 'Unknown item'
    const categoryName = item.menu_items?.categories?.name ?? 'Uncategorised'
    const lineTotal = Number(item.unit_price) * item.qty
    const dish = dishMap.get(name) ?? { qty: 0, revenuePaise: 0 }
    dish.qty += item.qty
    dish.revenuePaise += lineTotal
    dishMap.set(name, dish)
    categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + lineTotal)
  }
  const topDishes = Array.from(dishMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise)
    .slice(0, 10)
  const salesByCategory = Array.from(categoryMap.entries())
    .map(([name, revenuePaise]) => ({ name, revenuePaise }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise)

  const paymentModeMap = new Map<string, number>()
  for (const p of paymentsToday.data ?? []) {
    paymentModeMap.set(p.mode, (paymentModeMap.get(p.mode) ?? 0) + Number(p.amount))
  }
  const paymentModeSplit = Array.from(paymentModeMap.entries()).map(([mode, amountPaise]) => ({
    mode,
    amountPaise,
  }))

  const trend7d = ((trendRes.data as unknown as { bucket: string; net: number }[]) ?? []).map((r) => ({
    bucket: r.bucket,
    netPaise: Number(r.net ?? 0),
  }))

  const floorGroups = new Map<string, { sortOrder: number; tables: { id: string; name: string; status: string }[] }>()
  for (const t of tables) {
    const floorName = t.floors?.name ?? 'Unassigned'
    const sortOrder = t.floors?.sort_order ?? 0
    if (!floorGroups.has(floorName)) floorGroups.set(floorName, { sortOrder, tables: [] })
    floorGroups.get(floorName)!.tables.push({ id: t.id, name: t.name, status: t.status })
  }
  const floorMap = Array.from(floorGroups.entries())
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([floorName, v]) => ({ floorName, tables: v.tables }))

  const now = Date.now()
  const slowOrders = (slowItemsRes.data ?? [])
    .map((item) => {
      const minutes = Math.floor((now - new Date(item.created_at).getTime()) / 60000)
      const table = item.orders?.table_sessions?.tables?.name ?? 'Unknown table'
      return { table, minutes }
    })
    .filter((s) => s.minutes >= 20)
    .sort((a, b) => b.minutes - a.minutes)

  const billRequestedTables = tables.filter((t) => t.status === 'bill_requested').map((t) => t.name)

  return {
    todaySalesPaise,
    ordersToday: ordersToday.data?.length ?? 0,
    avgBillPaise,
    coversToday,
    tablesFree,
    tablesOccupied,
    tablesTotal: tables.length,
    ordersInKitchen,
    pendingPayments: openToday.length,
    salesByHour,
    topDishes,
    salesByCategory,
    paymentModeSplit,
    trend7d,
    floorMap,
    slowOrders,
    billRequestedTables,
    whatsappFailedCount: whatsappFailedRes.count ?? 0,
  }
}
