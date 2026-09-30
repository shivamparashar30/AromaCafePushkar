import { supabase } from '@/lib/supabase'
import { getMyOutletId } from '@/lib/outlet'
import type { Database } from '@/lib/database.types'

export interface Customer {
  id: string
  name: string | null
  phone: string
  whatsapp_opt_in: boolean
  visits: number
  total_spend: number
  created_at: string
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, whatsapp_opt_in, visits, total_spend, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export interface CustomerInput {
  name: string
  phone: string
  whatsapp_opt_in?: boolean
}

export async function createCustomer(input: CustomerInput) {
  const outletId = await getMyOutletId()

  const { error } = await supabase.from('customers').insert({
    outlet_id: outletId,
    name: input.name,
    phone: input.phone,
    whatsapp_opt_in: input.whatsapp_opt_in ?? false,
  })
  if (error) throw error
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const { error } = await supabase.from('customers').update(input).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------------

export interface CustomerBill {
  id: string
  bill_no: string | null
  status: Database['public']['Enums']['bill_status']
  total: number
  subtotal: number
  discount: number
  created_at: string
  table_name: string
  item_count: number
}

export interface CustomerDetail {
  customer: Customer
  bills: CustomerBill[]
  /** Paid bills only — this is what customers.total_spend is derived from. */
  paidCount: number
  avgBill: number
  firstVisit: string | null
  lastVisit: string | null
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetail> {
  const [{ data: customer, error: custErr }, { data: bills, error: billErr }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, whatsapp_opt_in, visits, total_spend, created_at')
      .eq('id', customerId)
      .single(),
    supabase
      .from('bills')
      .select(
        'id, bill_no, status, total, subtotal, discount, created_at, table_sessions(tables(name), orders(order_items(id)))',
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
  ])
  if (custErr) throw custErr
  if (billErr) throw billErr

  const rows: CustomerBill[] = (bills ?? []).map((b: any) => ({
    id: b.id,
    bill_no: b.bill_no,
    status: b.status,
    total: b.total,
    subtotal: b.subtotal,
    discount: b.discount,
    created_at: b.created_at,
    table_name: b.table_sessions?.tables?.name ?? '—',
    item_count: (b.table_sessions?.orders ?? []).reduce(
      (sum: number, o: any) => sum + (o.order_items?.length ?? 0),
      0,
    ),
  }))

  const paid = rows.filter((b) => b.status === 'paid')
  const dates = paid.map((b) => b.created_at).sort()

  return {
    customer: customer as Customer,
    bills: rows,
    paidCount: paid.length,
    avgBill: paid.length > 0 ? Math.round(paid.reduce((s, b) => s + b.total, 0) / paid.length) : 0,
    firstVisit: dates[0] ?? null,
    lastVisit: dates[dates.length - 1] ?? null,
  }
}
