import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Order } from '../../lib/types'
import { typeScale, type KdsTheme, type ScreenClass } from '../../kds/theme'
import type { KdsSettings } from '../../kds/settings'

/**
 * Total outstanding quantity per dish across every ticket, so the line can batch-cook
 * ("Butter Naan × 14") instead of reading the same dish off eight separate cards.
 * Counts only what still needs cooking — anything already ready is not outstanding.
 */
export function AllDayPanel({
  orders,
  theme,
  screen,
  settings,
}: {
  orders: Order[]
  theme: KdsTheme
  screen: ScreenClass
  settings: KdsSettings
}) {
  const t = typeScale(screen, settings.fontScale)

  const totals = new Map<string, number>()
  for (const order of orders) {
    for (const item of order.items) {
      if (item.status !== 'ordered' && item.status !== 'cooking') continue
      const key = item.variant_name
        ? `${item.menu_item_name} (${item.variant_name})`
        : item.menu_item_name
      totals.set(key, (totals.get(key) ?? 0) + item.qty)
    }
  }

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return null

  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { fontSize: t.meta, color: theme.textDim }]}>
        All day · still to cook
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {rows.map(([name, qty]) => (
          <View key={name} style={[styles.chip, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
            <Text style={[styles.qty, { fontSize: t.item, color: theme.accent }]}>{qty}</Text>
            <Text style={[styles.name, { fontSize: t.note, color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, paddingVertical: 10, marginBottom: 10 },
  title: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 14, marginBottom: 8 },
  row: { paddingHorizontal: 14, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  qty: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  name: { fontWeight: '600', maxWidth: 220 },
})
