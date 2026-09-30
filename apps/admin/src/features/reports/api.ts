import { supabase } from '@/lib/supabase'

export type GroupBy = 'day' | 'month' | 'year' | 'waiter'

export interface SalesRow {
  bucket: string
  bills: number
  gross: number
  discounts: number
  tax: number
  net: number
}

export async function fetchSalesReport(from: string, to: string, groupBy: GroupBy): Promise<SalesRow[]> {
  const { data, error } = await supabase.rpc('report_sales', {
    p_from: from,
    p_to: to,
    p_group_by: groupBy,
  })
  if (error) throw error
  return (data as unknown as SalesRow[]) ?? []
}

export interface DishSale {
  item_id: string
  name: string
  category_id: string
  qty_sold: number
  revenue: number
  cancellations: number
}

export async function fetchDishSales(): Promise<DishSale[]> {
  const { data, error } = await supabase
    .from('v_dish_sales')
    .select('item_id, name, category_id, qty_sold, revenue, cancellations')
    .order('revenue', { ascending: false })

  if (error) throw error
  return (data ?? []) as DishSale[]
}

export interface TableSale {
  table_id: string
  table_name: string
  bills: number
  revenue: number
  avg_turnaround_minutes: number
}

export async function fetchTableSales(): Promise<TableSale[]> {
  const { data, error } = await supabase
    .from('v_table_sales')
    .select('table_id, table_name, bills, revenue, avg_turnaround_minutes')
    .order('revenue', { ascending: false })

  if (error) throw error
  return (data ?? []) as TableSale[]
}
