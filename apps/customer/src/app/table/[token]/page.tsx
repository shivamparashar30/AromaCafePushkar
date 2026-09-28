'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/money'
import styles from './page.module.css'

interface Addon { id: string; name: string; price: number }
interface AddonGroup { id: string; name: string; min_select: number; max_select: number; addons: Addon[] }
interface Variant { id: string; name: string; price: number }
interface MenuItem { id: string; name: string; description: string | null; price: number; food_type: string; variants: Variant[]; addon_groups: AddonGroup[] }
interface Category { id: string; name: string; items: MenuItem[] }

interface TableInfo {
  table_id: string
  table_name: string
  outlet_name: string
  session_id: string
  menu: Category[]
}

interface CartItem {
  item: MenuItem
  qty: number
  variantId?: string
  variantName?: string
  addonIds: string[]
  unitPrice: number
}

interface OrderStatus {
  id: string
  kot_number: number
  status: string
  items: { name: string; status: string; qty: number }[]
}

export default function TablePage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<OrderStatus[]>([])
  const [placing, setPlacing] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Resolve QR and sign in anonymously
  useEffect(() => {
    async function init() {
      try {
        // Sign in anonymously
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          await supabase.auth.signInAnonymously()
        }

        const { data, error: rpcError } = await supabase.rpc('resolve_qr', { p_token: token })
        if (rpcError) throw rpcError
        if (!data || data.error) throw new Error(data?.error ?? 'Invalid QR code')

        const info: TableInfo = {
          table_id: data.table_id,
          table_name: data.table_name,
          outlet_name: data.outlet_name,
          session_id: data.session_id,
          menu: data.menu ?? [],
        }
        setTableInfo(info)
        if (info.menu.length > 0) setActiveCategory(info.menu[0].id)

        // Load existing orders for this session
        if (info.session_id) loadOrders(info.session_id)
      } catch (err: any) {
        setError(err.message || 'Could not load menu')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token])

  const loadOrders = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('id, kot_number, status, order_items(qty, status, menu_item:menu_items(name))')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (data) {
      setOrders(
        data.map((o: any) => ({
          id: o.id,
          kot_number: o.kot_number,
          status: o.status,
          items: (o.order_items ?? []).map((i: any) => ({
            name: (i.menu_item as any)?.name ?? '',
            status: i.status,
            qty: i.qty,
          })),
        })),
      )
    }
  }, [])

  // Realtime for order updates
  useEffect(() => {
    if (!tableInfo?.session_id) return
    const sid = tableInfo.session_id
    const channel = supabase
      .channel(`customer-${sid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders(sid))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders(sid))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tableInfo?.session_id, loadOrders])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id && !c.variantId)
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { item, qty: 1, addonIds: [], unitPrice: item.price }]
    })
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c, i) => (i === index ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0),
    )
  }

  async function handlePlaceOrder() {
    if (!tableInfo?.session_id || cart.length === 0) return
    setPlacing(true)
    try {
      const items = cart.map((c) => ({
        item_id: c.item.id,
        variant_id: c.variantId,
        qty: c.qty,
        addon_ids: c.addonIds.length > 0 ? c.addonIds : undefined,
      }))
      const { error: rpcError } = await supabase.rpc('place_order', {
        p_session_id: tableInfo.session_id,
        p_items: items,
      })
      if (rpcError) throw rpcError
      setCart([])
      loadOrders(tableInfo.session_id)
    } catch (err: any) {
      alert(err.message || 'Could not place order')
    } finally {
      setPlacing(false)
    }
  }

  async function handleCallWaiter() {
    if (!tableInfo?.session_id) return
    try {
      await supabase.rpc('call_waiter', { p_session_id: tableInfo.session_id })
      alert('Waiter has been notified!')
    } catch {
      alert('Could not call waiter')
    }
  }

  async function handleRequestBill() {
    if (!tableInfo?.session_id) return
    try {
      await supabase.rpc('request_bill', { p_session_id: tableInfo.session_id })
      alert('Bill has been requested!')
    } catch {
      alert('Could not request bill')
    }
  }

  if (loading) return <div className={styles.center}><p>Loading menu...</p></div>
  if (error) return <div className={styles.center}><p className={styles.error}>{error}</p></div>
  if (!tableInfo) return <div className={styles.center}><p>Table not found</p></div>

  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0)
  const activeItems = tableInfo.menu.find((c) => c.id === activeCategory)?.items ?? []

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.outletName}>{tableInfo.outlet_name}</h1>
        <p className={styles.tableBadge}>Table {tableInfo.table_name}</p>
      </header>

      {/* Category tabs */}
      <nav className={styles.categoryBar}>
        {tableInfo.menu.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.categoryTab} ${cat.id === activeCategory ? styles.categoryTabActive : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      {/* Menu items */}
      <main className={styles.menuList}>
        {activeItems.map((item) => (
          <div key={item.id} className={styles.menuCard}>
            <div className={styles.menuInfo}>
              <span className={`${styles.foodDot} ${item.food_type === 'veg' ? styles.veg : styles.nonVeg}`} />
              <div>
                <p className={styles.menuName}>{item.name}</p>
                {item.description && <p className={styles.menuDesc}>{item.description}</p>}
                <p className={styles.menuPrice}>{formatMoney(item.price)}</p>
              </div>
            </div>
            <button className={styles.addBtn} onClick={() => addToCart(item)}>Add</button>
          </div>
        ))}
      </main>

      {/* Order status */}
      {orders.length > 0 && (
        <section className={styles.ordersSection}>
          <h2 className={styles.sectionTitle}>Your orders</h2>
          {orders.map((o) => (
            <div key={o.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <span className={styles.kotLabel}>KOT #{o.kot_number}</span>
                <span className={`${styles.orderStatus} ${styles[`status_${o.status}`] ?? ''}`}>
                  {o.status}
                </span>
              </div>
              {o.items.map((item, i) => (
                <div key={i} className={styles.orderItem}>
                  <span>{item.qty}x {item.name}</span>
                  <span className={`${styles.itemStatus} ${item.status === 'ready' ? styles.ready : ''}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* Action buttons */}
      <div className={styles.actionRow}>
        <button className={styles.secondaryBtn} onClick={handleCallWaiter}>Call waiter</button>
        <button className={styles.secondaryBtn} onClick={handleRequestBill}>Request bill</button>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className={styles.cartBar}>
          <div className={styles.cartItems}>
            {cart.map((c, i) => (
              <div key={i} className={styles.cartRow}>
                <span className={styles.cartName}>{c.qty}x {c.item.name}</span>
                <div className={styles.cartControls}>
                  <button className={styles.qtyBtn} onClick={() => updateQty(i, -1)}>-</button>
                  <button className={styles.qtyBtn} onClick={() => updateQty(i, 1)}>+</button>
                  <span className={styles.cartPrice}>{formatMoney(c.unitPrice * c.qty)}</span>
                </div>
              </div>
            ))}
          </div>
          <button className={styles.placeOrderBtn} onClick={handlePlaceOrder} disabled={placing}>
            {placing ? 'Placing…' : `Place order — ${formatMoney(cartTotal)}`}
          </button>
        </div>
      )}
    </div>
  )
}
