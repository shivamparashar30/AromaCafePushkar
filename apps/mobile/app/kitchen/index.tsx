import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { fetchKitchenOrders, markItemsCooking, markItemsReady } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { Order } from '../../src/lib/types'

const ORANGE = '#E8713A'

const STATUS_COLORS: Record<string, string> = {
  ordered: '#3b82f6',
  cooking: ORANGE,
  ready: '#22c55e',
}

export default function KitchenOrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchKitchenOrders()
      setOrders(data)
    } catch (err) {
      console.error('Failed to load kitchen orders', err)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleStartCooking(itemIds: string[]) {
    try {
      await markItemsCooking(itemIds)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update status')
    }
  }

  async function handleMarkReady(itemIds: string[]) {
    try {
      await markItemsReady(itemIds)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update status')
    }
  }

  function elapsedMinutes(createdAt: string): number {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />}
        renderItem={({ item: order }) => {
          const elapsed = elapsedMinutes(order.created_at)
          const isUrgent = elapsed >= 15

          return (
            <View style={[styles.orderCard, isUrgent && styles.urgentCard]}>
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.kotLabel}>KOT #{order.kot_number}</Text>
                  <Text style={styles.tableName}>{order.table_name}</Text>
                  <Text style={styles.sourceLabel}>
                    {order.source === 'customer' ? `Customer: ${order.placed_by_name || 'Guest'}` : order.placed_by_name ?? order.source}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.elapsed, isUrgent && styles.urgentText]}>
                    {elapsed} min ago
                  </Text>
                  <Text style={styles.orderStatusLabel}>{order.status}</Text>
                </View>
              </View>

              {order.items
                .filter((i) => i.status !== 'cancelled' && i.status !== 'served')
                .map((item) => (
                  <View key={item.id} style={styles.itemRow}>
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
                      {item.notes && <Text style={styles.noteText}>{item.notes}</Text>}
                      {item.station && <Text style={styles.stationText}>{item.station}</Text>}
                    </View>
                    <View style={styles.itemActions}>
                      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? '#999' }]} />
                      {item.status === 'ordered' && (
                        <Pressable style={styles.cookBtn} onPress={() => handleStartCooking([item.id])}>
                          <Text style={styles.btnText}>Start</Text>
                        </Pressable>
                      )}
                      {item.status === 'cooking' && (
                        <Pressable style={styles.readyBtn} onPress={() => handleMarkReady([item.id])}>
                          <Text style={styles.btnText}>Ready</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}

              {/* Bulk actions */}
              <View style={styles.bulkRow}>
                {order.items.some((i) => i.status === 'ordered') && (
                  <Pressable
                    style={styles.cookBtn}
                    onPress={() =>
                      handleStartCooking(order.items.filter((i) => i.status === 'ordered').map((i) => i.id))
                    }
                  >
                    <Text style={styles.btnText}>Start all</Text>
                  </Pressable>
                )}
                {order.items.some((i) => i.status === 'cooking') && (
                  <Pressable
                    style={styles.readyBtn}
                    onPress={() =>
                      handleMarkReady(order.items.filter((i) => i.status === 'cooking').map((i) => i.id))
                    }
                  >
                    <Text style={styles.btnText}>All ready</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyCheck}>✓</Text>
            <Text style={styles.emptyText}>No pending orders</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  orderCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  urgentCard: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  kotLabel: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  tableName: { fontSize: 13, color: '#888', marginTop: 2 },
  sourceLabel: { fontSize: 11, color: ORANGE, fontWeight: '500', marginTop: 2 },
  elapsed: { fontSize: 12, color: '#999' },
  urgentText: { color: '#ef4444', fontWeight: '600' },
  orderStatusLabel: { fontSize: 11, color: '#999', textTransform: 'capitalize', marginTop: 2 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  itemName: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  addonText: { fontSize: 12, color: '#999', marginTop: 2 },
  noteText: { fontSize: 12, color: ORANGE, fontStyle: 'italic', marginTop: 2 },
  stationText: { fontSize: 11, color: '#3b82f6', fontWeight: '500', marginTop: 2 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cookBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  readyBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bulkRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyCheck: { fontSize: 40, marginBottom: 8, color: '#22c55e' },
  emptyText: { fontSize: 16, color: '#999' },
})
