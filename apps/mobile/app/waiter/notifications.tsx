import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { acknowledgeNotification, fetchNotifications } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'

const EVENT_LABELS: Record<string, string> = {
  order_ready: 'Order ready',
  call_waiter: 'Call waiter',
  bill_requested: 'Bill requested',
  new_unassigned_table: 'New table',
  item_cancelled: 'Item cancelled',
  order_waiting_too_long: 'Order waiting',
  booking_arriving: 'Booking arriving',
}

export default function NotificationsScreen() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications()
      setNotifications(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('waiter-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function handleAcknowledge(id: string) {
    if (!profile) return
    try {
      await acknowledgeNotification(id, profile.id)
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.event}>{EVENT_LABELS[item.event] ?? item.event}</Text>
              <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString()}</Text>
            </View>
            <Pressable style={styles.ackBtn} onPress={() => handleAcknowledge(item.id)}>
              <Text style={styles.ackBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No new alerts.</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  event: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 12, color: '#888', marginTop: 2 },
  ackBtn: { backgroundColor: '#eee', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  ackBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },
})
