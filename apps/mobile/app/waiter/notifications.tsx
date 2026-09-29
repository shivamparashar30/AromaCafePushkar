import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'
import { acknowledgeNotification, fetchNotifications } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'

const ORANGE = '#E8713A'

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  order_ready: { icon: 'checkmark-circle', color: '#22c55e', label: 'Order ready' },
  call_waiter: { icon: 'hand-left', color: '#3b82f6', label: 'Call waiter' },
  bill_requested: { icon: 'receipt', color: ORANGE, label: 'Bill requested' },
  new_unassigned_table: { icon: 'grid', color: '#8b5cf6', label: 'New table' },
  item_cancelled: { icon: 'close-circle', color: '#ef4444', label: 'Item cancelled' },
  order_waiting_too_long: { icon: 'time', color: '#ef4444', label: 'Order waiting' },
  booking_arriving: { icon: 'calendar', color: '#06b6d4', label: 'Booking arriving' },
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

  function timeAgo(dateStr: string): string {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const config = EVENT_CONFIG[item.event] ?? { icon: 'alert-circle', color: '#999', label: item.event }
          return (
            <View style={styles.card}>
              <View style={[styles.iconCircle, { backgroundColor: config.color + '18' }]}>
                <Ionicons name={config.icon as any} size={20} color={config.color} />
              </View>
              <View style={styles.content}>
                <Text style={styles.event}>{config.label}</Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
              <Pressable style={styles.dismissBtn} onPress={() => handleAcknowledge(item.id)}>
                <Ionicons name="close" size={18} color="#999" />
              </Pressable>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No new alerts</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  list: { paddingVertical: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: { flex: 1 },
  event: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  time: { fontSize: 12, color: '#999', marginTop: 2 },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 15, color: '#999', marginTop: 12 },
})
