import { useFocusEffect, useLocalSearchParams, router, Stack } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../../src/context/AuthContext'
import {
  cancelItem,
  clampPhone,
  isValidPhone,
  setSessionCustomer,
  createBill,
  fetchSessionBill,
  fetchMenuForOrdering,
  fetchSessionOrders,
  leaveTable,
  markItemServed,
  placeOrder,
} from '../../../src/lib/api'
import { supabase } from '../../../src/lib/supabase'
import type { MenuItem, Order } from '../../../src/lib/types'
import type { SessionBill } from '../../../src/lib/api'

const ORANGE = '#E8713A'
const ORANGE_LIGHT = '#FFF7F2'
const ORANGE_BORDER = '#FDDCC8'

export default function SessionScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<{ item: MenuItem; qty: number; variantId?: string; addonIds: string[] }[]>([])
  const [showMenu, setShowMenu] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tableName, setTableName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  // Guards the close path: the waiter's own "Leave" also closes the session, and the
  // realtime UPDATE for it would otherwise pop an alert about someone else's action.
  const closedRef = useRef(false)
  const tableNameRef = useRef('')
  const closeGuardRef = useRef<((reason: 'paid' | 'freed') => void) | null>(null)
  // Dishes with variants or add-ons need a choice before they can be priced; without
  // this the waiter silently billed the base price for a Half/Full item.
  // Whoever raised the bill — waiter, cashier, admin, or the customer requesting it —
  // the waiter needs to see that it exists before taking another order.
  const [bill, setBill] = useState<SessionBill | null>(null)
  const [showBill, setShowBill] = useState(false)
  // Customer on this table. Captured by the QR flow automatically; for a waiter-taken
  // order this is the only place it can be recorded, and without it the sale never
  // reaches the guest's visit count or lifetime spend.
  const [sessionCustomer, setSessionCustomerState] = useState<{ name: string; phone: string }>({ name: '', phone: '' })
  const [showCustomer, setShowCustomer] = useState(false)
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [savingCust, setSavingCust] = useState(false)
  const billAnim = useRef(new Animated.Value(0)).current
  // Separate from showBill so the sheet can animate OUT before the Modal unmounts.
  const [billMounted, setBillMounted] = useState(false)
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null)
  const [pickedVariant, setPickedVariant] = useState<string | undefined>(undefined)
  const [pickedAddons, setPickedAddons] = useState<string[]>([])

  /**
   * True when this session is no longer open, having already handed off to the close
   * handler. The table can be settled or freed from admin at any moment, and the only
   * row that changes is table_sessions.status — so nothing else on this screen would
   * notice on its own.
   */
  const sessionEnded = useCallback(async () => {
    if (!sessionId) return false
    const { data: session } = await supabase
      .from('table_sessions')
      .select('status')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session || session.status === 'open') return false

    // A settled table has a paid bill; a freed one does not. Saying the right thing
    // matters — "Bill settled" on a table the manager simply cleared is a lie.
    const { count } = await supabase
      .from('bills')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'paid')

    closeGuardRef.current?.((count ?? 0) > 0 ? 'paid' : 'freed')
    return true
  }, [sessionId])

  const loadOrders = useCallback(async () => {
    if (!sessionId) return
    try {
      if (await sessionEnded()) return

      const data = await fetchSessionOrders(sessionId)
      setOrders(data)
      try { setBill(await fetchSessionBill(sessionId)) } catch { /* non-blocking */ }

      const { data: sess } = await supabase
        .from('table_sessions')
        .select('customer_name, customer_phone')
        .eq('id', sessionId)
        .maybeSingle()
      if (sess) {
        setSessionCustomerState({
          name: sess.customer_name ?? '',
          phone: sess.customer_phone ?? '',
        })
      }
      if (data.length > 0 && data[0].table_name) {
        setTableName(data[0].table_name)
        tableNameRef.current = data[0].table_name
      }
    } catch (err) {
      console.error('Failed to load orders', err)
    }
  }, [sessionId, sessionEnded])

  useEffect(() => {
    loadOrders()
    fetchMenuForOrdering().then(setMenu).catch(console.error)

    if (sessionId) {
      supabase
        .from('table_sessions')
        .select('table:tables(name)')
        .eq('id', sessionId)
        .single()
        .then(({ data }) => {
          if (data?.table) {
            setTableName((data.table as any).name)
            tableNameRef.current = (data.table as any).name
          }
        })
    }
  }, [loadOrders, sessionId])

  // The session can end from somewhere else entirely -- a cashier marking the bill paid
  // in admin, or a manager freeing the table -- and this screen would otherwise sit on a
  // table that no longer exists, able to "add" orders to a closed session.
  const handleSessionClosed = useCallback((reason: 'paid' | 'freed') => {
    if (closedRef.current) return // the close can arrive twice; only act once
    closedRef.current = true

    setShowMenu(false)
    setCart([])
    router.replace('/waiter')
    Alert.alert(
      reason === 'paid' ? 'Bill settled' : 'Table freed',
      reason === 'paid'
        ? `${tableNameRef.current || 'This table'} has been paid and closed. It is free for the next guest.`
        : `${tableNameRef.current || 'This table'} was cleared and is free for the next guest.`,
    )
  }, [])

  useEffect(() => {
    closeGuardRef.current = handleSessionClosed
  }, [handleSessionClosed])

  useEffect(() => {
    if (showBill) {
      setBillMounted(true)
      Animated.timing(billAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start()
    } else if (billMounted) {
      Animated.timing(billAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setBillMounted(false)
      })
    }
  }, [showBill, billMounted, billAnim])

  // Realtime is the fast path, but it is not a guarantee: the socket can be asleep after
  // the phone was pocketed, and the close event is a single UPDATE that is easy to miss.
  // Nothing else on this screen would ever notice, so the waiter would sit on a dead
  // table indefinitely. A slow poll makes the handoff certain.
  useEffect(() => {
    if (!sessionId) return
    const timer = setInterval(() => { void sessionEnded() }, 15_000)
    return () => clearInterval(timer)
  }, [sessionId, sessionEnded])

  // And check immediately whenever the screen comes back into focus.
  useFocusEffect(
    useCallback(() => {
      void sessionEnded()
    }, [sessionEnded]),
  )

  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `session_id=eq.${sessionId}` },
        () => loadOrders(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'table_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if ((payload.new as { status?: string })?.status === 'closed') {
            handleSessionClosed('paid')
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, loadOrders, handleSessionClosed])

  async function handleRefresh() {
    setRefreshing(true)
    await loadOrders()
    setRefreshing(false)
  }

  function hasOptions(item: MenuItem) {
    return (item.variants?.length ?? 0) > 0 || (item.addon_groups?.length ?? 0) > 0
  }

  function handleAddPress(item: MenuItem) {
    if (hasOptions(item)) {
      setPickedVariant(undefined)
      setPickedAddons([])
      setOptionsItem(item)
      return
    }
    addToCart(item)
  }

  function confirmOptions() {
    if (!optionsItem) return
    const variants = optionsItem.variants ?? []
    if (variants.length > 0 && !pickedVariant) return
    setCart((prev) => [
      ...prev,
      { item: optionsItem, qty: 1, variantId: pickedVariant, addonIds: pickedAddons },
    ])
    setOptionsItem(null)
  }

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id && !c.variantId)
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { item, qty: 1, addonIds: [] }]
    })
  }

  function decreaseCartItem(itemId: string) {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === itemId && !c.variantId ? { ...c, qty: c.qty - 1 } : c))
        .filter((c) => c.qty > 0),
    )
  }

  function getCartQty(itemId: string): number {
    return cart.find((c) => c.item.id === itemId && !c.variantId)?.qty ?? 0
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0)

  const categories = useMemo(() => {
    const cats = [...new Set(menu.map((m) => m.category_name))].sort()
    return cats
  }, [menu])

  const filteredMenu = useMemo(() => {
    let items = menu
    if (activeCategory) {
      items = items.filter((m) => m.category_name === activeCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((m) => m.name.toLowerCase().includes(q))
    }
    return items
  }, [menu, activeCategory, search])

  async function handlePlaceOrder() {
    if (cart.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const items = cart.map((c) => ({
        item_id: c.item.id,
        variant_id: c.variantId,
        qty: c.qty,
        addon_ids: c.addonIds.length > 0 ? c.addonIds : undefined,
      }))
      await placeOrder(sessionId!, items)
      setCart([])
      setShowMenu(false)
      await loadOrders()
      Alert.alert('Order placed', 'Sent to kitchen')
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not place order')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * A waiter may cancel only while the kitchen has not started the item. Past that the
   * food exists and it becomes a manager's call — enforced server-side; this just avoids
   * offering a button that would be refused.
   */
  function handleCancelItem(item: { id: string; menu_item_name: string; qty: number }) {
    Alert.alert(
      'Cancel this item?',
      `${item.qty}× ${item.menu_item_name} will be removed from the order and the bill.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel item',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelItem(item.id)
              await loadOrders()
            } catch (err: any) {
              Alert.alert(
                "Can't cancel this",
                err.message || 'The kitchen may have already started it.',
              )
            }
          },
        },
      ],
    )
  }

  async function handleSaveCustomer() {
    if (!sessionId) return
    setSavingCust(true)
    try {
      await setSessionCustomer(sessionId, custName.trim(), clampPhone(custPhone))
      setShowCustomer(false)
      await loadOrders()
    } catch (err: any) {
      Alert.alert('Could not save', err.message || 'Please try again.')
    } finally {
      setSavingCust(false)
    }
  }

  function openCustomerSheet() {
    setCustName(sessionCustomer.name)
    setCustPhone(clampPhone(sessionCustomer.phone))
    setShowCustomer(true)
  }

  async function handleMarkServed(itemIds: string[]) {
    try {
      await markItemServed(itemIds)
      await loadOrders()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark served')
    }
  }

  async function handleCreateBill() {
    // Same call either way: create_bill raises the bill, or recomputes an existing open
    // one. That is what makes "add one more thing, then re-bill" safe to repeat.
    try {
      await createBill(sessionId!)
      await loadOrders()
      setShowBill(true)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not create bill')
    }
  }

  function handleLeaveTable() {
    // Tell the waiter why up front rather than letting the server refuse after the tap.
    if (activeOrderCount > 0) {
      Alert.alert(
        "Can't free this table",
        `This table has ${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}. ` +
          'Generate the bill and settle it, or cancel the orders first.',
        [{ text: 'OK' }],
      )
      return
    }

    Alert.alert(
      'Free this table?',
      'The session will be closed and the table marked free for the next guest.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Free table',
          style: 'destructive',
          onPress: async () => {
            try {
              closedRef.current = true // our own close; skip the realtime alert
              await leaveTable(sessionId!)
              router.back()
            } catch (err: any) {
              // The close never happened, so re-arm the guard for a real one later.
              closedRef.current = false
              Alert.alert("Can't free this table", err.message || 'Could not free the table')
            }
          },
        },
      ],
    )
  }

  // Anything not cancelled still belongs to the table, so it blocks freeing it.
  const activeOrderCount = orders.filter((o) => o.status !== 'cancelled').length

  // Billable lines come from the orders already loaded — no extra query, and always in
  // step with the board. Cancelled and wasted lines are excluded here because
  // compute_bill_totals excludes them from the total too.
  const billLines = orders.flatMap((o) =>
    o.items
      .filter((i) => i.status !== 'cancelled' && i.status !== 'wasted')
      .map((i) => ({
        id: i.id,
        name: i.menu_item_name + (i.variant_name ? ` (${i.variant_name})` : ''),
        addons: i.addons.map((a) => a.name).join(', '),
        qty: i.qty,
        lineTotal: i.unit_price * i.qty + i.addons.reduce((sum, a) => sum + a.price, 0),
      })),
  )

  const formatPrice = (paise: number) => `₹${(paise / 100).toFixed(0)}`

  const [cartExpanded, setCartExpanded] = useState(false)

  // ── Menu / ordering view ──
  if (showMenu) {
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 0

    return (
      <View style={[styles.container, { paddingTop: statusBarHeight }]}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header with orange accent */}
        <View style={styles.menuHeader}>
          <Pressable onPress={() => setShowMenu(false)} style={styles.menuBackBtn}>
            <Ionicons name="arrow-back" size={22} color={ORANGE} />
          </Pressable>
          <Text style={styles.menuTitle}>Add items</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#bbb" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu..."
            placeholderTextColor="#c4c4c4"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </Pressable>
          )}
        </View>

        {/* Category tabs */}
        <View style={styles.categoryRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryBar}
          >
            <Pressable
              style={[styles.categoryChip, !activeCategory && styles.categoryChipActive]}
              onPress={() => setActiveCategory(null)}
            >
              <Text style={[styles.categoryChipText, !activeCategory && styles.categoryChipTextActive]}>All</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
              >
                <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Cart summary bar */}
        {cart.length > 0 && (
          <View style={styles.cartSummary}>
            <Pressable style={styles.cartSummaryHeader} onPress={() => setCartExpanded(!cartExpanded)}>
              <Text style={styles.cartSummaryCount}>
                {cartCount} item{cartCount > 1 ? 's' : ''}
              </Text>
              <View style={styles.cartSummaryRight}>
                <Text style={styles.cartSummaryTotal}>{formatPrice(cartTotal)}</Text>
                <Ionicons
                  name={cartExpanded ? 'chevron-down' : 'chevron-up'}
                  size={16}
                  color="#fff9"
                />
              </View>
            </Pressable>
            {cartExpanded && (
              <ScrollView style={styles.cartScrollable}>
                <View style={styles.cartItemsList}>
                  {cart.map((c) => (
                    <View key={c.item.id} style={styles.cartRow}>
                      <Text style={styles.cartRowName} numberOfLines={1}>{c.item.name}</Text>
                      <Text style={styles.cartRowPrice}>{formatPrice(c.item.price * c.qty)}</Text>
                      <View style={styles.cartRowControls}>
                        <Pressable onPress={() => decreaseCartItem(c.item.id)} hitSlop={6}>
                          <Ionicons name="remove-circle" size={22} color="#fff" />
                        </Pressable>
                        <Text style={styles.cartRowQty}>{c.qty}</Text>
                        <Pressable onPress={() => addToCart(c.item)} hitSlop={6}>
                          <Ionicons name="add-circle" size={22} color="#fff" />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* Menu list */}
        <FlatList
          style={{ flex: 1 }}
          data={filteredMenu}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 20, paddingTop: 4 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={40} color="#ddd" />
              <Text style={styles.emptyText}>No items found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const qty = getCartQty(item.id)
            return (
              <View style={styles.menuItem}>
                <View style={{ flex: 1 }}>
                  <View style={styles.menuNameRow}>
                    <View style={[styles.foodDot, { backgroundColor: item.food_type === 'veg' ? '#22c55e' : '#ef4444' }]} />
                    <Text style={styles.menuName}>{item.name}</Text>
                  </View>
                  <Text style={styles.menuCategory}>{item.category_name}</Text>
                  <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
                </View>
                {qty > 0 ? (
                  <View style={styles.qtyControls}>
                    <Pressable onPress={() => decreaseCartItem(item.id)} style={styles.qtyBtn}>
                      <Ionicons name="remove" size={18} color={ORANGE} />
                    </Pressable>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <Pressable onPress={() => handleAddPress(item)} style={styles.qtyBtn}>
                      <Ionicons name="add" size={18} color={ORANGE} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => handleAddPress(item)} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>
                      {hasOptions(item) ? 'Choose' : 'Add'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )
          }}
        />

        {/* Place order button */}
        {cart.length > 0 && (
          <View style={styles.placeOrderBar}>
            <Pressable
              style={[styles.placeOrderBtn, submitting && { opacity: 0.6 }]}
              onPress={handlePlaceOrder}
              disabled={submitting}
            >
              <Text style={styles.placeOrderText}>
                {submitting ? 'Sending...' : `Send to kitchen · ${formatPrice(cartTotal)}`}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* Variant / add-on picker */}
        {optionsItem && (
          <View style={styles.optionsOverlay}>
            <View style={styles.optionsSheet}>
              <Text style={styles.optionsTitle}>{optionsItem.name}</Text>

              {/* A dish with several add-on groups can outgrow the sheet, so the choices
                  scroll while the actions stay pinned and reachable. */}
              <ScrollView
                style={styles.optionsScroll}
                contentContainerStyle={styles.optionsScrollContent}
                keyboardShouldPersistTaps="handled"
              >

              {(optionsItem.variants ?? []).length > 0 && (
                <View style={styles.optionsBlock}>
                  <Text style={styles.optionsLabel}>Variant (required)</Text>
                  <View style={styles.optionsRow}>
                    {(optionsItem.variants ?? []).map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => setPickedVariant(v.id)}
                        style={[styles.optionChip, pickedVariant === v.id && styles.optionChipActive]}
                      >
                        <Text style={[styles.optionChipText, pickedVariant === v.id && styles.optionChipTextActive]}>
                          {v.name} · {formatPrice(v.price)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {(optionsItem.addon_groups ?? []).map((g) => (
                <View key={g.id} style={styles.optionsBlock}>
                  <Text style={styles.optionsLabel}>
                    {g.name}{g.max_select > 0 ? ` (max ${g.max_select})` : ''}
                  </Text>
                  <View style={styles.optionsRow}>
                    {g.addons.map((a) => {
                      const on = pickedAddons.includes(a.id)
                      return (
                        <Pressable
                          key={a.id}
                          onPress={() =>
                            setPickedAddons((prev) =>
                              prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                            )
                          }
                          style={[styles.optionChip, on && styles.optionChipActive]}
                        >
                          <Text style={[styles.optionChipText, on && styles.optionChipTextActive]}>
                            {a.name} · +{formatPrice(a.price)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ))}

              </ScrollView>

              <View style={styles.optionsActions}>
                <Pressable style={styles.optionsCancel} onPress={() => setOptionsItem(null)}>
                  <Text style={styles.optionsCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.optionsConfirm,
                    (optionsItem.variants ?? []).length > 0 && !pickedVariant && { opacity: 0.5 },
                  ]}
                  onPress={confirmOptions}
                  disabled={(optionsItem.variants ?? []).length > 0 && !pickedVariant}
                >
                  <Text style={styles.optionsConfirmText}>Add to order</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    )
  }

  // ── Orders view ──
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: tableName || 'Table',
          headerBackTitle: 'Tables',
        }}
      />

      {/* Customer on this table. Shown before the bill because the right moment to ask
          is while taking the order, not while settling up. */}
      <Pressable style={styles.customerRow} onPress={openCustomerSheet}>
        <Ionicons
          name={sessionCustomer.phone ? 'person-circle' : 'person-add-outline'}
          size={20}
          color={sessionCustomer.phone ? ORANGE : '#999'}
        />
        <View style={{ flex: 1 }}>
          {sessionCustomer.phone ? (
            <>
              <Text style={styles.customerName}>{sessionCustomer.name || 'Customer'}</Text>
              <Text style={styles.customerPhone}>{sessionCustomer.phone}</Text>
            </>
          ) : (
            <Text style={styles.customerAdd}>Add customer</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#bbb" />
      </Pressable>

      {/* Bill banner — the waiter's first signal that this table has been billed,
          whichever device raised it. */}
      {bill && (
        <Pressable
          style={[styles.billBanner, bill.status === 'paid' && styles.billBannerPaid]}
          onPress={() => setShowBill(true)}
        >
          <Ionicons
            name={bill.status === 'paid' ? 'checkmark-circle' : 'receipt'}
            size={20}
            color={bill.status === 'paid' ? '#15803d' : ORANGE}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.billBannerTitle}>
              {bill.status === 'paid' ? 'Bill paid' : 'Bill generated'}
              {bill.bill_no ? ` · ${bill.bill_no}` : ''}
            </Text>
            {bill.items_added_since > 0 && bill.status !== 'paid' && (
              <Text style={styles.billBannerWarn}>
                {bill.items_added_since} item{bill.items_added_since === 1 ? '' : 's'} added since —
                tap to review
              </Text>
            )}
          </View>
          <Text style={styles.billBannerTotal}>{formatPrice(bill.total)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#bbb" />
        </Pressable>
      )}

      {/* Action buttons */}
      <View style={styles.actionBar}>
        <Pressable style={styles.orderBtn} onPress={() => setShowMenu(true)}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.orderBtnText}>New order</Text>
        </Pressable>
        <Pressable
          style={styles.billBtn}
          onPress={() => (bill ? setShowBill(true) : handleCreateBill())}
        >
          <Ionicons name="receipt-outline" size={18} color={ORANGE} />
          <Text style={styles.billBtnText}>{bill ? 'View bill' : 'Bill'}</Text>
        </Pressable>
        <Pressable
          style={[styles.leaveBtn, activeOrderCount > 0 && styles.leaveBtnDisabled]}
          onPress={handleLeaveTable}
        >
          <Ionicons
            name="exit-outline"
            size={18}
            color={activeOrderCount > 0 ? '#c4c4c4' : '#ef4444'}
          />
          <Text style={[styles.leaveBtnText, activeOrderCount > 0 && styles.leaveBtnTextDisabled]}>
            Leave
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />}
        contentContainerStyle={styles.ordersList}
        renderItem={({ item: order }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderLeft}>
                <Text style={styles.kotLabel}>KOT #{order.kot_number}</Text>
                <Text style={styles.orderTime}>
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {order.source === 'customer' ? `Customer: ${order.placed_by_name || 'Guest'}` : order.placed_by_name ?? order.source}
                </Text>
              </View>
              <View style={[
                styles.orderStatusBadge,
                order.status === 'placed' && { backgroundColor: '#dbeafe' },
                order.status === 'cooking' && { backgroundColor: '#FFF0E8' },
                order.status === 'completed' && { backgroundColor: '#dcfce7' },
              ]}>
                <Text style={[
                  styles.orderStatusText,
                  order.status === 'placed' && { color: '#1d4ed8' },
                  order.status === 'cooking' && { color: ORANGE },
                  order.status === 'completed' && { color: '#15803d' },
                ]}>
                  {order.status}
                </Text>
              </View>
            </View>
            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {item.qty}× {item.menu_item_name}
                    {item.variant_name ? ` (${item.variant_name})` : ''}
                  </Text>
                  {item.addons.length > 0 && (
                    <Text style={styles.addonText}>
                      + {item.addons.map((a) => a.name).join(', ')}
                    </Text>
                  )}
                  {item.notes && <Text style={styles.noteText}>Note: {item.notes}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[
                    styles.itemStatus,
                    item.status === 'ready' && { color: '#22c55e', fontWeight: '700' },
                    item.status === 'served' && { color: '#999' },
                  ]}>
                    {item.status}
                  </Text>
                  {item.status === 'ordered' && (
                    <Pressable
                      style={styles.cancelItemBtn}
                      onPress={() => handleCancelItem(item)}
                      hitSlop={6}
                    >
                      <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                      <Text style={styles.cancelItemText}>Cancel</Text>
                    </Pressable>
                  )}
                  {item.status === 'ready' && (
                    <Pressable style={styles.serveBtn} onPress={() => handleMarkServed([item.id])}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={styles.serveBtnText}>Serve</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubtext}>Tap "New order" to start</Text>
          </View>
        }
      />

      {/* Customer sheet */}
      <Modal
        visible={showCustomer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomer(false)}
      >
        <View style={styles.custOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCustomer(false)} />
          <View style={styles.custCard}>
            <Text style={styles.custTitle}>
              {sessionCustomer.phone ? 'Edit customer' : 'Add customer'}
            </Text>
            <Text style={styles.custHint}>
              The number links this table&apos;s bills to the guest&apos;s visits and total spend.
            </Text>

            <TextInput
              style={styles.custInput}
              placeholder="Name"
              placeholderTextColor="#bbb"
              value={custName}
              onChangeText={setCustName}
            />
            <TextInput
              style={styles.custInput}
              placeholder="10-digit mobile number"
              placeholderTextColor="#bbb"
              value={custPhone}
              onChangeText={(v) => setCustPhone(clampPhone(v))}
              keyboardType="number-pad"
              maxLength={10}
            />
            {custPhone.length > 0 && !isValidPhone(custPhone) && (
              <Text style={styles.custError}>Enter a valid 10-digit mobile number.</Text>
            )}

            <View style={styles.custActions}>
              <Pressable style={styles.optionsCancel} onPress={() => setShowCustomer(false)}>
                <Text style={styles.optionsCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.optionsConfirm,
                  (savingCust || (custPhone.length > 0 && !isValidPhone(custPhone))) && { opacity: 0.5 },
                ]}
                onPress={handleSaveCustomer}
                disabled={savingCust || (custPhone.length > 0 && !isValidPhone(custPhone))}
              >
                <Text style={styles.optionsConfirmText}>
                  {savingCust ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bill. A real Modal so the backdrop covers the whole screen; an absolute overlay
          inside this view would dim only part of it. */}
      <Modal
        visible={billMounted && !!bill}
        transparent
        animationType="none"
        onRequestClose={() => setShowBill(false)}
      >
        <View style={styles.billOverlay}>
          {/* Backdrop fades in place behind the sheet. It sits BEHIND rather than wrapping
              it, so a tap on the sheet never reaches it and the sheet's height is governed
              only by its own style. */}
          <Animated.View
            style={[styles.billBackdrop, { opacity: billAnim }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBill(false)} />
          </Animated.View>

          <Animated.View
            style={[
              styles.billSheet,
              {
                transform: [{
                  translateY: billAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                }],
              },
            ]}
          >
            {bill && (
              <>
                <View style={styles.billGrabber} />
                <View style={styles.billSheetHeader}>
                  <Text style={styles.optionsTitle}>{bill.bill_no ?? 'Bill'}</Text>
                  <View style={[
                    styles.billStatusPill,
                    bill.status === 'paid' && { backgroundColor: '#dcfce7' },
                  ]}>
                    <Text style={[
                      styles.billStatusText,
                      bill.status === 'paid' && { color: '#15803d' },
                    ]}>
                      {bill.status === 'paid' ? 'PAID' : 'OPEN'}
                    </Text>
                  </View>
                </View>

                {/* Only the items scroll. Totals stay pinned — a bill whose total can
                    scroll out of sight is useless at the table. */}
                <ScrollView style={styles.billScroll} showsVerticalScrollIndicator={false}>
                  {billLines.map((line) => (
                    <View key={line.id} style={styles.billItemRow}>
                      <Text style={styles.billItemQty}>{line.qty}×</Text>
                      <View style={styles.billItemBody}>
                        <Text style={styles.billItemName}>{line.name}</Text>
                        {!!line.addons && <Text style={styles.billItemAddons}>+ {line.addons}</Text>}
                      </View>
                      <Text style={styles.billItemTotal}>{formatPrice(line.lineTotal)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.billTotals}>
                  <BillRow label="Subtotal" value={formatPrice(bill.subtotal)} />
                  {bill.discount > 0 && <BillRow label="Discount" value={`- ${formatPrice(bill.discount)}`} />}
                  {bill.service_charge > 0 && <BillRow label="Service charge" value={formatPrice(bill.service_charge)} />}
                  {bill.tax_total > 0 && <BillRow label="Tax" value={formatPrice(bill.tax_total)} />}
                  {bill.round_off !== 0 && <BillRow label="Round off" value={formatPrice(bill.round_off)} />}
                  <View style={styles.billDivider} />
                  <BillRow label="Total" value={formatPrice(bill.total)} bold />
                </View>

                {bill.items_added_since > 0 && bill.status !== 'paid' && (
                  <View style={styles.billNotice}>
                    <Ionicons name="information-circle" size={16} color="#9A5B00" />
                    <Text style={styles.billNoticeText}>
                      {bill.items_added_since} item
                      {bill.items_added_since === 1 ? '' : 's'} added after this bill was printed.
                      Total here is already up to date — re-generate for a fresh copy.
                    </Text>
                  </View>
                )}

                <View style={styles.billActions}>
                  <Pressable style={styles.optionsCancel} onPress={() => setShowBill(false)}>
                    <Text style={styles.optionsCancelText}>Close</Text>
                  </Pressable>
                  {bill.status !== 'paid' && (
                    <Pressable style={styles.optionsConfirm} onPress={handleCreateBill}>
                      <Ionicons name="refresh" size={16} color="#fff" />
                      <Text style={styles.optionsConfirmText}>Re-generate</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

    </View>
  )
}

function BillRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.billRow}>
      <Text style={[styles.billRowLabel, bold && styles.billRowBold]}>{label}</Text>
      <Text style={[styles.billRowValue, bold && styles.billRowBold]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ORANGE,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: ORANGE,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  orderBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  billBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ORANGE_LIGHT,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    paddingVertical: 10,
    borderRadius: 12,
  },
  billBtnText: { color: ORANGE, fontSize: 14, fontWeight: '700' },
  cancelItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelItemText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },

  // Customer on this table
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  customerName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  customerPhone: { fontSize: 12, color: '#999', marginTop: 1 },
  customerAdd: { fontSize: 14, fontWeight: '600', color: '#999' },
  custOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,18,22,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  custCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  custTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  custHint: { fontSize: 12, color: '#999', lineHeight: 17, marginBottom: 4 },
  custInput: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  custError: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  custActions: { flexDirection: 'row', gap: 10, marginTop: 6 },

  // Bill banner + sheet
  billBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    backgroundColor: ORANGE_LIGHT,
  },
  billBannerPaid: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  billBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  billBannerWarn: { fontSize: 12, fontWeight: '600', color: '#9A5B00', marginTop: 2 },
  billBannerTotal: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  billSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  billStatusPill: { backgroundColor: '#FFF0E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  billStatusText: { fontSize: 12, fontWeight: '800', color: ORANGE, letterSpacing: 0.5 },
  // The overlay itself is transparent; the dim lives on billBackdrop so it can fade
  // independently of the sheet's slide.
  billOverlay: { flex: 1, justifyContent: 'flex-end' },
  billBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,18,22,0.55)' },
  billSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    // Clears the tab bar and the home indicator beneath it.
    paddingBottom: 34,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  billGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0e0e0',
    marginBottom: 14,
  },
  billScroll: { flexGrow: 0 },
  billItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  billItemQty: { fontSize: 14, fontWeight: '800', color: ORANGE, minWidth: 28 },
  billItemBody: { flex: 1, minWidth: 0 },
  billItemName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  billItemAddons: { fontSize: 12, color: '#999', marginTop: 1 },
  billItemTotal: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', fontVariant: ['tabular-nums'] },
  billTotals: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 10 },
  billActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  billRowLabel: { fontSize: 14, color: '#666' },
  billRowValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '600' },
  billRowBold: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  billDivider: { height: 1, backgroundColor: '#eee', marginVertical: 6 },
  billNotice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFF4E0',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  billNoticeText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#9A5B00', lineHeight: 17 },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  leaveBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },

  // Variant / add-on picker
  optionsOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    // React Native paints siblings in tree order and ignores stacking without an
    // explicit zIndex, so the cart bar covered the sheet's own buttons.
    zIndex: 100,
    elevation: 100,
  },
  optionsSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    // Clears the tab bar underneath, which would otherwise sit over Add to order.
    paddingBottom: 40,
    gap: 4,
    maxHeight: '80%',
  },
  optionsTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  optionsScroll: { flexGrow: 0 },
  optionsScrollContent: { paddingBottom: 4 },
  optionsBlock: { marginBottom: 12 },
  optionsLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  optionChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  optionChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  optionChipTextActive: { color: '#fff' },
  optionsActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  optionsCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    alignItems: 'center',
  },
  optionsCancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  optionsConfirm: {
    flex: 2,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  leaveBtnDisabled: { borderColor: '#eee', backgroundColor: '#fafafa' },
  leaveBtnTextDisabled: { color: '#c4c4c4' },

  // Orders list
  ordersList: { paddingVertical: 8 },
  orderCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderHeaderLeft: {},
  kotLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  orderTime: { fontSize: 12, color: '#999', marginTop: 2 },
  orderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
    color: '#888',
  },
  orderItem: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  itemName: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  addonText: { fontSize: 12, color: '#999', marginTop: 2 },
  noteText: { fontSize: 12, color: ORANGE, fontStyle: 'italic', marginTop: 2 },
  itemStatus: { fontSize: 12, color: '#999', textTransform: 'capitalize' },
  serveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 4,
  },
  serveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Menu header
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ORANGE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    padding: 0,
  },

  // Category tabs
  categoryRow: {
    height: 56,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryBar: {
    paddingHorizontal: 12,
    height: 56,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  categoryChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
  },
  categoryChipTextActive: {
    color: '#fff',
  },

  // Cart summary
  cartSummary: {
    backgroundColor: ORANGE,
  },
  cartSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cartSummaryCount: { color: '#fff9', fontSize: 13, fontWeight: '600' },
  cartSummaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartSummaryTotal: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cartScrollable: {
    maxHeight: 200,
  },
  cartItemsList: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 6,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cartRowName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  cartRowPrice: { color: '#fff9', fontSize: 13, fontWeight: '600', marginRight: 12 },
  cartRowControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartRowQty: { color: '#fff', fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },

  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 3,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  menuNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodDot: { width: 8, height: 8, borderRadius: 4 },
  menuName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  menuCategory: { fontSize: 12, color: '#999', marginTop: 2, marginLeft: 14 },
  menuPrice: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginTop: 4, marginLeft: 14 },

  // Quantity controls
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE_LIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    padding: 6,
  },
  qtyText: { fontSize: 15, fontWeight: '700', minWidth: 24, textAlign: 'center', color: ORANGE },
  addBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Place order bar
  placeOrderBar: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  placeOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 14,
  },
  placeOrderText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#ccc', marginTop: 4 },
})
