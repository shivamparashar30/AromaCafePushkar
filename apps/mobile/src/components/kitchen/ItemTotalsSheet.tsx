import { FlatList, StyleSheet, Text, View } from 'react-native'
import { K } from '../../kitchen/theme'
import type { TotalsRow } from '../../kitchen/ticket'
import { Sheet } from './Sheet'

/**
 * "All day" view: every dish still to make, summed across tickets, so the tandoor can
 * slap on twelve naan at once instead of three, four and five.
 */
export function ItemTotalsSheet({ visible, rows, station, onClose }: {
  visible: boolean
  rows: TotalsRow[]
  station: string | null
  onClose: () => void
}) {
  return (
    <Sheet
      visible={visible}
      title="Item totals"
      subtitle={`Everything still to make${station ? ` at ${station}` : ''}, across all open tickets`}
      onClose={onClose}
    >
      <View style={styles.headRow}>
        <Text style={[styles.head, { flex: 1 }]}>Dish</Text>
        <Text style={[styles.head, styles.num]}>To start</Text>
        <Text style={[styles.head, styles.num]}>Cooking</Text>
        <Text style={[styles.head, styles.num]}>Total</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
              {item.variant ? <Text style={styles.variant}> ({item.variant})</Text> : null}
            </Text>
            <Text style={[styles.cell, styles.num, { color: item.toStart ? K.blue : K.textFaint }]}>{item.toStart}</Text>
            <Text style={[styles.cell, styles.num, { color: item.cooking ? K.orange : K.textFaint }]}>{item.cooking}</Text>
            <Text style={[styles.total, styles.num]}>{item.toStart + item.cooking}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Nothing waiting to be cooked.</Text>}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: K.border },
  head: { fontSize: 12, fontWeight: '700', color: K.textMuted, textTransform: 'uppercase' },
  num: { width: 72, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: K.divider },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: K.text },
  variant: { color: K.textMuted, fontWeight: '500' },
  cell: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  total: { fontSize: 18, fontWeight: '800', color: K.text, fontVariant: ['tabular-nums'] },
  empty: { textAlign: 'center', color: K.textFaint, paddingVertical: 32, fontSize: 15 },
})
