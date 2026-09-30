'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/money'
import styles from './page.module.css'

interface Addon { id: string; name: string; price: number }
interface AddonGroup { id: string; name: string; min_select: number; max_select: number; addons: Addon[] }
interface Variant { id: string; name: string; price: number }
interface MenuItem { id: string; name: string; description: string | null; price: number; food_type: string; in_stock: boolean; variants: Variant[]; addon_groups: AddonGroup[] }
interface Category { id: string; name: string; items: MenuItem[] }

// A 10-digit Indian mobile number, tolerant of spaces/dashes and a +91 prefix.
function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

// Drops a +91 country code so the stored phone is always the bare 10 digits —
// that is the value customers.phone is keyed on, so "+91 81122 70790" and
// "8112270790" resolve to the same customer.
function normalizePhone(value: string) {
  return digitsOnly(value).replace(/^91(?=\d{10}$)/, '')
}

function isValidPhone(value: string) {
  return /^[6-9]\d{9}$/.test(normalizePhone(value))
}

function isValidName(value: string) {
  return value.trim().length >= 2
}

interface LiveBill {
  id: string
  bill_no: string | null
  status: string
  subtotal: number
  discount: number
  service_charge: number
  tax_total: number
  total: number
}

interface TableInfo {
  table_id: string
  table_name: string
  outlet_name: string
  session_id: string | null
  customer_name: string | null
  customer_phone: string | null
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
  source: string
  placed_by_name: string | null
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
  const [bill, setBill] = useState<LiveBill | null>(null)
  const [live, setLive] = useState(false)
  const [authed, setAuthed] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  // Customer details — both name and phone are required before an order can be placed.
  const [showNameModal, setShowNameModal] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Re-resolves the QR. Also (re)binds this anonymous device to the table's open
  // session server-side, which is what lets RLS — and therefore realtime — show us
  // the session's orders and bill.
  const refreshTable = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('resolve_qr', { p_token: token })
    if (rpcError) throw rpcError
    if (!data) throw new Error('Invalid QR code')

    const info: TableInfo = {
      table_id: data.table?.id,
      table_name: data.table?.name,
      outlet_name: data.outlet?.name,
      session_id: data.session_id ?? null,
      customer_name: data.customer_name ?? null,
      customer_phone: data.customer_phone ?? null,
      menu: data.menu ?? [],
    }
    // Session ended (bill settled) or the table was reseated: drop stale local state
    // so the next guest starts clean. Tracked in a ref so this stays outside React's
    // updater functions, which must remain side-effect free.
    if (sessionIdRef.current && sessionIdRef.current !== info.session_id) {
      setOrders([])
      setBill(null)
      setCart([])
    }
    sessionIdRef.current = info.session_id
    setTableInfo(info)
    return info
  }, [token])

  // Resolve QR
  useEffect(() => {
    async function init() {
      try {
        // Anonymous sign-in is what every customer-side RLS policy keys off. Without a
        // JWT the realtime socket connects as `anon`, matches no policy, and silently
        // delivers nothing — so a failure here is reported, not swallowed. Reads still
        // work (they go through SECURITY DEFINER RPCs), so we degrade to polling rather
        // than blocking the whole page.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          const { error: authError } = await supabase.auth.signInAnonymously()
          if (authError) {
            console.error(
              '[customer] anonymous sign-in failed — live updates will fall back to polling. ' +
                'Enable Authentication → Sign In / Providers → Anonymous sign-ins in Supabase.',
              authError.message,
            )
            setAuthed(false)
          } else {
            setAuthed(true)
          }
        } else {
          setAuthed(true)
        }

        const info = await refreshTable()
        if (info.customer_name) setCustomerName(info.customer_name)
        if (info.customer_phone) setCustomerPhone(info.customer_phone)
        if (info.menu.length > 0) setActiveCategory(info.menu[0].id)

        if (info.session_id) {
          loadOrders(info.session_id)
          loadBill(info.session_id)
        }
      } catch (err: any) {
        setError(err.message || 'Could not load menu')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token])

  const loadOrders = useCallback(async (sessionId: string) => {
    const { data } = await supabase.rpc('customer_fetch_orders', { p_session_id: sessionId })
    if (data) {
      const orderList = Array.isArray(data) ? data : []
      setOrders(
        orderList.map((o: any) => ({
          id: o.id,
          kot_number: o.kot_number,
          status: o.status,
          source: o.source,
          placed_by_name: o.placed_by_name,
          items: (o.items ?? []).map((i: any) => ({
            name: i.name ?? '',
            status: i.status,
            qty: i.qty,
          })),
        })),
      )
    }
  }, [])

  // Read straight from the table — RLS scopes this to the caller's own session.
  const loadBill = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('bills')
      .select('id, bill_no, status, subtotal, discount, service_charge, tax_total, total')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setBill((data as LiveBill) ?? null)
  }, [])

  // Live updates for this session: kitchen progress, the bill, and session closure.
  // order_items carries no session_id, so it is filtered by RLS rather than by a
  // server-side filter; the others are narrowed to this session to cut chatter.
  useEffect(() => {
    if (!tableInfo?.session_id) return
    const sid = tableInfo.session_id

    const refreshOrders = () => { loadOrders(sid); loadBill(sid) }

    // Prime on (re)subscribe: covers a session that appeared via the poll below, and
    // backfills anything missed while the socket was down.
    refreshOrders()

    const channel = supabase
      .channel(`customer-session-${sid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `session_id=eq.${sid}` },
        refreshOrders)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        refreshOrders)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `session_id=eq.${sid}` },
        () => loadBill(sid))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'table_sessions', filter: `id=eq.${sid}` },
        (payload) => {
          // Bill settled and table freed: drop back to a clean menu for the next guest.
          if ((payload.new as { status?: string })?.status === 'closed') {
            sessionIdRef.current = null
            setOrders([])
            setBill(null)
            setCart([])
            setTableInfo((prev) => (prev ? { ...prev, session_id: null } : prev))
          }
        })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))

    return () => {
      setLive(false)
      supabase.removeChannel(channel)
    }
  }, [tableInfo?.session_id, loadOrders, loadBill])

  // Polling pass. It has two jobs:
  //
  //  1. Fallback. Realtime only delivers if the device holds an anonymous JWT, since
  //     every customer policy is `to authenticated`. If anonymous sign-in is disabled
  //     on the project the socket still connects (as `anon`) and reports SUBSCRIBED,
  //     but no row ever passes RLS. Polling keeps the page correct regardless.
  //  2. Reconciliation, for the two windows realtime cannot cover even when healthy:
  //     before the first order there is no session to subscribe to, and once the bill
  //     is paid the session closes, so customer_session_id() stops matching and RLS
  //     filters out the very event announcing the close.
  //
  // resolve_qr and customer_fetch_orders are SECURITY DEFINER, so both work unauthed.
  useEffect(() => {
    if (loading || error) return

    const sid = tableInfo?.session_id
    const healthy = live && authed

    // Order/bill status is the part guests actually watch, and it is cheap to fetch,
    // so poll it tightly while flying blind and back right off once realtime works.
    const statusTimer = sid
      ? setInterval(() => { loadOrders(sid); loadBill(sid) }, healthy ? 60_000 : 8_000)
      : null

    // resolve_qr returns the whole menu, so it stays on a slow cadence either way.
    // It is what detects a session opening or closing underneath us.
    const tableTimer = setInterval(() => { refreshTable().catch(() => {}) }, 30_000)

    return () => {
      if (statusTimer) clearInterval(statusTimer)
      clearInterval(tableTimer)
    }
  }, [tableInfo?.session_id, loading, error, live, authed, refreshTable, loadOrders, loadBill])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id && !c.variantId)
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { item, qty: 1, addonIds: [], unitPrice: item.price }]
    })
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c, i) => (i === index ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0),
    )
  }

  function handlePlaceOrderClick() {
    if (cart.length === 0) return
    // Name and phone are both mandatory: the phone is what ties this order to the
    // customer record the restaurant tracks spend against.
    if (!isValidName(customerName) || !isValidPhone(customerPhone)) {
      setDetailsError(null)
      setShowNameModal(true)
      return
    }
    doPlaceOrder()
  }

  function handleConfirmDetails() {
    if (!isValidName(customerName)) {
      setDetailsError('Please enter your name.')
      return
    }
    if (!isValidPhone(customerPhone)) {
      setDetailsError('Please enter a valid 10-digit mobile number.')
      return
    }
    setDetailsError(null)
    doPlaceOrder()
  }

  async function doPlaceOrder() {
    if (!tableInfo || cart.length === 0) return
    setPlacing(true)
    setShowNameModal(false)
    try {
      const items = cart.map((c) => ({
        item_id: c.item.id,
        variant_id: c.variantId,
        qty: c.qty,
        addon_ids: c.addonIds.length > 0 ? c.addonIds : undefined,
      }))

      const { data, error: rpcError } = await supabase.rpc('customer_place_order', {
        p_table_id: tableInfo.table_id,
        p_items: items,
        p_customer_name: customerName.trim(),
        p_customer_phone: normalizePhone(customerPhone),
      })
      if (rpcError) throw rpcError

      // Update session_id if this was the first order
      const newSessionId = data?.session_id ?? tableInfo.session_id
      if (newSessionId && newSessionId !== tableInfo.session_id) {
        sessionIdRef.current = newSessionId
        setTableInfo((prev) => prev ? { ...prev, session_id: newSessionId, customer_name: customerName, customer_phone: customerPhone } : prev)
      }

      setCart([])
      if (newSessionId) { loadOrders(newSessionId); loadBill(newSessionId) }
    } catch (err: any) {
      alert(err.message || 'Could not place order')
    } finally {
      setPlacing(false)
    }
  }

  async function handleCallWaiter() {
    if (!tableInfo?.session_id) {
      alert('Please place an order first')
      return
    }
    try {
      await supabase.rpc('call_waiter', { p_session_id: tableInfo.session_id })
      alert('Waiter has been notified!')
    } catch {
      alert('Could not call waiter')
    }
  }

  async function handleRequestBill() {
    if (!tableInfo?.session_id) {
      alert('Please place an order first')
      return
    }
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
          <div className={styles.ordersHeader}>
            <h2 className={styles.sectionTitle}>Your orders</h2>
            {live && authed && (
              <span className={styles.liveTag}>
                <span className={styles.liveDot} />
                Live
              </span>
            )}
          </div>
          {orders.map((o) => (
            <div key={o.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <div>
                  <span className={styles.kotLabel}>KOT #{o.kot_number}</span>
                  <span className={styles.orderSource}>
                    {o.source === 'customer' ? `  ${o.placed_by_name || 'You'}` : `  Waiter: ${o.placed_by_name ?? ''}`}
                  </span>
                </div>
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

      {/* Bill — appears the moment staff generate it, and updates as it is settled */}
      {bill && (
        <section className={styles.billSection}>
          <div className={styles.billHeader}>
            <h2 className={styles.sectionTitle}>
              {bill.status === 'paid' ? 'Bill paid' : 'Your bill'}
            </h2>
            {bill.bill_no && <span className={styles.billNo}>#{bill.bill_no}</span>}
          </div>
          <div className={styles.billRow}><span>Subtotal</span><span>{formatMoney(bill.subtotal)}</span></div>
          {bill.discount > 0 && (
            <div className={styles.billRow}><span>Discount</span><span>&minus;{formatMoney(bill.discount)}</span></div>
          )}
          {bill.service_charge > 0 && (
            <div className={styles.billRow}><span>Service charge</span><span>{formatMoney(bill.service_charge)}</span></div>
          )}
          {bill.tax_total > 0 && (
            <div className={styles.billRow}><span>Tax</span><span>{formatMoney(bill.tax_total)}</span></div>
          )}
          <div className={`${styles.billRow} ${styles.billTotal}`}>
            <span>Total</span><span>{formatMoney(bill.total)}</span>
          </div>
          {bill.status === 'paid' && (
            <p className={styles.billPaid}>Thank you! This bill has been settled.</p>
          )}
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
          <button className={styles.placeOrderBtn} onClick={handlePlaceOrderClick} disabled={placing}>
            {placing ? 'Placing...' : `Place order — ${formatMoney(cartTotal)}`}
          </button>
        </div>
      )}

      {/* Customer name modal */}
      {showNameModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Your details</h3>
            <p className={styles.modalSubtitle}>So we can attach this order to your bill</p>
            <input
              className={styles.modalInput}
              placeholder="Your name"
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setDetailsError(null) }}
              autoFocus
            />
            <input
              className={styles.modalInput}
              placeholder="Mobile number"
              value={customerPhone}
              onChange={(e) => { setCustomerPhone(e.target.value); setDetailsError(null) }}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={15}
            />
            {detailsError && <p className={styles.modalError}>{detailsError}</p>}
            <div className={styles.modalButtons}>
              <button className={styles.modalCancel} onClick={() => setShowNameModal(false)}>Cancel</button>
              <button
                className={styles.modalConfirm}
                onClick={handleConfirmDetails}
                disabled={placing || !isValidName(customerName) || !isValidPhone(customerPhone)}
              >
                Place order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
