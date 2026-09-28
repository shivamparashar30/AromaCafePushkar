import { useLocalSearchParams, router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useAuth } from '../../../src/context/AuthContext'
import {
  createBill,
  fetchMenuForOrdering,
  fetchSessionOrders,
  markItemServed,
  placeOrder,
} from '../../../src/lib/api'
import { supabase } from '../../../src/lib/supabase'
import type { MenuItem, Order } from '../../../src/lib/types'

export default function SessionScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<{ item: MenuItem; qty: number; variantId?: string; addonIds: string[] }[]>([])
  const [showMenu, setShowMenu] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadOrders = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await fetchSessionOrders(sessionId)
      setOrders(data)
    } catch (err) {
      console.error('Failed to load orders', err)
    }
  }, [sessionId])

  useEffect(() => {
    loadOrders()
    fetchMenuForOrdering().then(setMenu).catch(console.error)
  }, [loadOrders])

  // Realtime
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

  async function handlePlaceOrder() {
    if (cart.length === 0) return
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

  const formatPrice = (paise: number) => `₹${(paise / 100).toFixed(0)}`

  if (showMenu) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setShowMenu(false)}>
            <Text style={styles.backBtn}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Add items</Text>
          {cart.length > 0 && (
            <Pressable style={styles.sendBtn} onPress={handlePlaceOrder}>
              <Text style={styles.sendBtnText}>Send ({cart.length})</Text>
            </Pressable>
          )}
        </View>

        {cart.length > 0 && (
          <View style={styles.cartBar}>
            {cart.map((c, i) => (
              <Text key={i} style={styles.cartItem}>
                {c.qty}x {c.item.name}
              </Text>
            ))}
          </View>
        )}

        <FlatList
          data={menu}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <Pressable style={styles.menuItem} onPress={() => addToCart(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>{item.name}</Text>
                <Text style={styles.menuCategory}>{item.category_name}</Text>
              </View>
              <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Tables</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Session</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.actionBtn} onPress={() => setShowMenu(true)}>
            <Text style={styles.actionBtnText}>+ Order</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]} onPress={handleCreateBill}>
            <Text style={styles.actionBtnText}>Bill</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item: order }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.kotLabel}>KOT #{order.kot_number}</Text>
              <Text style={styles.orderStatus}>{order.status}</Text>
            </View>
            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {item.qty}x {item.menu_item_name}
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
                  <Text style={[styles.itemStatus, item.status === 'ready' && { color: '#22c55e', fontWeight: '700' }]}>
                    {item.status}
                  </Text>
                  {item.status === 'ready' && (
                    <Pressable style={styles.serveBtn} onPress={() => handleMarkServed([item.id])}>
                      <Text style={styles.serveBtnText}>Serve</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet. Tap "+ Order" to start.</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  backBtn: { fontSize: 15, color: '#3b82f6', fontWeight: '500' },
  actionBtn: { backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  orderCard: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  kotLabel: { fontSize: 14, fontWeight: '700' },
  orderStatus: { fontSize: 12, color: '#888', textTransform: 'capitalize' },
  orderItem: { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  itemName: { fontSize: 14, fontWeight: '500' },
  addonText: { fontSize: 12, color: '#888', marginTop: 2 },
  noteText: { fontSize: 12, color: '#f59e0b', fontStyle: 'italic', marginTop: 2 },
  itemStatus: { fontSize: 12, color: '#888', textTransform: 'capitalize' },
  serveBtn: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, marginTop: 4 },
  serveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  // Menu overlay
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 2, padding: 14, borderRadius: 8 },
  menuName: { fontSize: 15, fontWeight: '500' },
  menuCategory: { fontSize: 12, color: '#888', marginTop: 2 },
  menuPrice: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
  cartBar: { backgroundColor: '#111', padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cartItem: { color: '#fff', fontSize: 12, backgroundColor: '#333', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  sendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },
})
