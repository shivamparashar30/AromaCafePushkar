import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { fetchStockList, setItemStock } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { StockItem } from '../../src/lib/types'
import { K } from '../../src/kitchen/theme'

const FOOD_COLOR: Record<string, string> = { veg: K.green, non_veg: K.red, egg: K.amber }

/**
 * The kitchen marks dishes it has run out of. place_order refuses an out-of-stock dish,
 * and the waiter's menu hides it, so flipping a switch here stops new orders for it at once.
 */
export default function KitchenStockScreen() {
  const [items, setItems] = useState<StockItem[]>([])
  const [query, setQuery] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Ids with a change in flight, so a double tap cannot fire two RPCs that race.
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      setItems(await fetchStockList())
    } catch (err) {
      console.error('Failed to load stock list', err)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // A manager flipping stock from the dashboard shows up here too.
  useEffect(() => {
    const channel = supabase
      .channel('kitchen-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function toggle(item: StockItem, inStock: boolean) {
    if (busy.has(item.id)) return
    setBusy((prev) => new Set(prev).add(item.id))
    // Optimistic: the switch should move under the cook's finger, not after a round trip.
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, in_stock: inStock } : i)))
    try {
      await setItemStock(item.id, inStock)
    } catch (err: any) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, in_stock: !inStock } : i)))
      Alert.alert('Could not update stock', err?.message || 'Please try again.')
    } finally {
      setBusy((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const outCount = items.filter((i) => !i.in_stock).length

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byCategory = new Map<string, StockItem[]>()
    for (const i of items) {
      if (onlyOut && i.in_stock) continue
      if (q && !i.name.toLowerCase().includes(q) && !(i.station ?? '').toLowerCase().includes(q)) continue
      const list = byCategory.get(i.category_name) ?? []
      list.push(i)
      byCategory.set(i.category_name, list)
    }
    return [...byCategory.entries()].map(([title, data]) => ({ title, data }))
  }, [items, query, onlyOut])

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={K.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search dishes or stations"
            placeholderTextColor={K.textFaint}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          style={[styles.filter, onlyOut && styles.filterActive]}
          onPress={() => setOnlyOut((v) => !v)}
          accessibilityLabel="Show only out of stock"
        >
          <Text style={[styles.filterText, onlyOut && styles.filterTextActive]}>
            Out of stock{outCount > 0 ? ` (${outCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={K.orange} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, !item.in_stock && styles.rowOut]}>
            <View style={[styles.foodMark, { borderColor: FOOD_COLOR[item.food_type] ?? K.textFaint }]}>
              <View style={[styles.foodDot, { backgroundColor: FOOD_COLOR[item.food_type] ?? K.textFaint }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, !item.in_stock && styles.nameOut]}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.in_stock ? 'Available' : 'Out of stock · hidden from new orders'}
                {item.station ? ` · ${item.station}` : ''}
              </Text>
            </View>
            <Switch
              value={item.in_stock}
              onValueChange={(v) => toggle(item, v)}
              disabled={busy.has(item.id)}
              trackColor={{ false: '#fecaca', true: '#bbf7d0' }}
              thumbColor={item.in_stock ? K.green : K.red}
              ios_backgroundColor="#fecaca"
              accessibilityLabel={`${item.name} ${item.in_stock ? 'in stock' : 'out of stock'}`}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={onlyOut ? 'checkmark-circle-outline' : 'search-outline'} size={36} color="#d4d4d4" />
            <Text style={styles.emptyText}>
              {onlyOut ? 'Everything is in stock' : 'No dishes match'}
            </Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: K.border,
  },
  search: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44,
    paddingHorizontal: 12, borderRadius: 12, backgroundColor: K.bg, borderWidth: 1, borderColor: '#e5e5e5',
  },
  searchInput: { flex: 1, fontSize: 15, color: K.text },
  filter: {
    height: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center',
    borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff',
  },
  filterActive: { backgroundColor: K.red, borderColor: K.red },
  filterText: { fontSize: 13, fontWeight: '700', color: K.redDark },
  filterTextActive: { color: '#fff' },
  list: { paddingBottom: 24 },
  sectionHeader: {
    fontSize: 12, fontWeight: '800', color: K.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: K.bg,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60,
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 3, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: K.border,
  },
  rowOut: { backgroundColor: K.redSoft, borderColor: '#fecaca' },
  foodMark: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  foodDot: { width: 7, height: 7, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '600', color: K.text },
  nameOut: { color: K.redDark },
  meta: { fontSize: 12, color: K.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 8 },
  emptyText: { fontSize: 15, color: K.textFaint },
})
