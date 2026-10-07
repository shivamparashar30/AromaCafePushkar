import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Order } from '../../lib/types'
import { K } from '../../kitchen/theme'
import { Sheet } from './Sheet'

/** Tickets cleared off the board by hand, so one cleared by mistake can be brought back. */
export function ClearedSheet({ visible, orders, onRestore, onRestoreAll, onClose }: {
  visible: boolean
  orders: Order[]
  onRestore: (order: Order) => void
  onRestoreAll: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      visible={visible}
      title="Cleared tickets"
      subtitle="Hidden from this screen only. They are still waiting for a waiter."
      onClose={onClose}
    >
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kot}>
                #{item.kot_number} <Text style={styles.table}>{item.table_name || 'Counter'}</Text>
              </Text>
              <Text style={styles.items} numberOfLines={1}>
                {item.items.filter((i) => i.status !== 'cancelled').map((i) => `${i.qty}× ${i.menu_item_name}`).join(', ')}
              </Text>
            </View>
            <Pressable style={styles.restore} onPress={() => onRestore(item)}>
              <Text style={styles.restoreText}>Show</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No cleared tickets.</Text>}
      />
      {orders.length > 1 && (
        <Pressable style={styles.all} onPress={onRestoreAll}>
          <Text style={styles.allText}>Show all {orders.length} again</Text>
        </Pressable>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: K.divider },
  kot: { fontSize: 16, fontWeight: '800', color: K.text },
  table: { color: K.orange, fontWeight: '700' },
  items: { fontSize: 13, color: K.textMuted, marginTop: 2 },
  restore: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: K.orangeSoft },
  restoreText: { color: K.orange, fontWeight: '800' },
  empty: { textAlign: 'center', color: K.textFaint, paddingVertical: 32, fontSize: 15 },
  all: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  allText: { color: K.orange, fontWeight: '700' },
})
