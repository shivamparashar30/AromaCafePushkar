import { useLocalSearchParams, router, Stack } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
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
  createBill,
  fetchMenuForOrdering,
  fetchSessionOrders,
  leaveTable,
  markItemServed,
  placeOrder,
} from '../../../src/lib/api'
import { supabase } from '../../../src/lib/supabase'
import type { MenuItem, Order } from '../../../src/lib/types'

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

  const loadOrders = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await fetchSessionOrders(sessionId)
      setOrders(data)
      if (data.length > 0 && data[0].table_name) {
        setTableName(data[0].table_name)
      }
    } catch (err) {
      console.error('Failed to load orders', err)
    }
  }, [sessionId])

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
          if (data?.table) setTableName((data.table as any).name)
        })
    }
  }, [loadOrders, sessionId])

  useEffect(() => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, loadOrders])

  async function handleRefresh() {
    setRefreshing(true)
    await loadOrders()
    setRefreshing(false)
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

  async function handleMarkServed(itemIds: string[]) {
    try {
      await markItemServed(itemIds)
      await loadOrders()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not mark served')
    }
  }

  async function handleCreateBill() {
    try {
      await createBill(sessionId!)
      Alert.alert('Bill created', 'Bill has been generated')
      await loadOrders()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not create bill')
    }
  }

  function handleLeaveTable() {
    Alert.alert(
      'Leave table?',
      'This will free up the table. You can only leave if there are no active orders.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveTable(sessionId!)
              router.back()
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not leave table')
            }
          },
        },
      ],
    )
  }

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
                    <Pressable onPress={() => addToCart(item)} style={styles.qtyBtn}>
                      <Ionicons name="add" size={18} color={ORANGE} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => addToCart(item)} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>Add</Text>
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

      {/* Action buttons */}
      <View style={styles.actionBar}>
        <Pressable style={styles.orderBtn} onPress={() => setShowMenu(true)}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.orderBtnText}>New order</Text>
        </Pressable>
        <Pressable style={styles.billBtn} onPress={handleCreateBill}>
          <Ionicons name="receipt-outline" size={18} color={ORANGE} />
          <Text style={styles.billBtnText}>Bill</Text>
        </Pressable>
        <Pressable style={styles.leaveBtn} onPress={handleLeaveTable}>
          <Ionicons name="exit-outline" size={18} color="#ef4444" />
          <Text style={styles.leaveBtnText}>Leave</Text>
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
