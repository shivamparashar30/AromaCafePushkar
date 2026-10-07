export interface TableWithSession {
  id: string
  name: string
  capacity: number
  status: string
  floor_name: string
  session_id: string | null
  waiter_id: string | null
  guest_count: number | null
}

export interface OrderItem {
  id: string
  qty: number
  unit_price: number
  notes: string | null
  status: string
  menu_item_name: string
  variant_name: string | null
  addons: { name: string; price: number }[]
  station: string | null
  /** Set only by the kitchen fetch: why a cancelled item was cancelled. */
  cancel_reason?: string | null
  /** Set only by the kitchen fetch: the dish's expected prep time, for ticket timers. */
  prep_minutes?: number
}

export interface Order {
  id: string
  kot_number: number
  status: string
  source: string
  placed_by_name: string | null
  created_at: string
  table_name: string
  items: OrderItem[]
  /** Set only by the kitchen fetch: 1 for a table's first KOT, 2+ for add-on rounds. */
  session_kot_seq?: number
  /** Set only by the kitchen fetch: when the order last changed (e.g. was cancelled). */
  updated_at?: string
}

export interface StockItem {
  id: string
  name: string
  category_name: string
  food_type: string
  station: string | null
  in_stock: boolean
}

export interface MenuItem {
  id: string
  name: string
  price: number
  food_type: string
  in_stock: boolean
  category_name: string
  variants: { id: string; name: string; price: number }[]
  addon_groups: {
    id: string
    name: string
    min_select: number
    max_select: number
    addons: { id: string; name: string; price: number }[]
  }[]
}
