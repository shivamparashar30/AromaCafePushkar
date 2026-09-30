import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { fetchRecentlyServed, markItemsReady } from '../../src/lib/api'
import type { Order } from '../../src/lib/types'
import { useKdsSettings } from '../../src/kds/settings'
import { elapsedLabel, screenClassFor, themeFor, touchSize, typeScale } from '../../src/kds/theme'

/**
 * Completed tickets. Deliberately thin: the kitchen's only real need here is to confirm
 * what went out and to pull one back if it was marked served by mistake. Anything
 * analytical belongs in the admin dashboard, not on a tablet by the pass.
 */
export default function KitchenHistory() {
  const { width } = useWindowDimensions()
  const { settings, loaded } = useKdsSettings()
  const screen = screenClassFor(width)
  const theme = themeFor(settings)
  const t = typeScale(screen, settings.fontScale)
  const touch = touchSize(screen)

  const [orders, setOrders] = useState<Order[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try { setOrders(await fetchRecentlyServed(40)) } catch { setOrders([]) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function bringBack(order: Order) {
    const ids = order.items.filter((i) => i.status === 'served').map((i) => i.id)
    if (ids.length === 0) return
    try {
      await markItemsReady(ids)
      await load()
    } catch (err) {
      console.error('Could not bring the ticket back', err)
    }
  }

  if (!loaded) return <View style={[styles.fill, { backgroundColor: theme.bg }]} />

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { fontSize: t.kot * 0.8, color: theme.text }]}>Served today</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
      >
        {orders.map((o) => (
          <View key={o.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.rowBody}>
              <Text style={[styles.kot, { fontSize: t.item, color: theme.text }]}>
                KOT #{o.kot_number} · {o.table_name || 'Takeaway'}
              </Text>
              <Text style={[styles.items, { fontSize: t.note, color: theme.textDim }]} numberOfLines={2}>
                {o.items.map((i) => `${i.qty} × ${i.menu_item_name}`).join(', ')}
              </Text>
            </View>

            <Text style={[styles.time, { fontSize: t.note, color: theme.textDim }]}>
              {elapsedLabel(o.created_at)}
            </Text>

            <Pressable
              onPress={() => bringBack(o)}
              style={[styles.back, { minHeight: touch, minWidth: touch, borderColor: theme.border }]}
              accessibilityLabel={`Bring KOT ${o.kot_number} back to Ready`}
            >
              <Ionicons name="arrow-undo" size={t.item} color={theme.accent} />
            </Pressable>
          </View>
        ))}

        {orders.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={t.kot} color={theme.textDim} />
            <Text style={[styles.emptyText, { fontSize: t.note, color: theme.textDim }]}>
              Nothing served yet
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontWeight: '800' },
  content: { padding: 16, paddingBottom: 120, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  kot: { fontWeight: '800' },
  items: { fontWeight: '500' },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  back: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { fontWeight: '600' },
})
