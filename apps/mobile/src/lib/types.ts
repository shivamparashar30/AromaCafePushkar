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
}

export interface Order {
  id: string
  kot_number: number
  status: string
  source: string
  created_at: string
  table_name: string
  items: OrderItem[]
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
