import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useNavigation } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { fetchKitchenOrders, recallItems } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { Order, OrderItem } from '../../src/lib/types'
import { K } from '../../src/kitchen/theme'
import { filterByStation, itemTotals, stageOf, type Stage } from '../../src/kitchen/ticket'
import { useDismissedTickets, useKitchenPrefs } from '../../src/kitchen/prefs'
import { useNewOrderAlert } from '../../src/kitchen/useNewOrderAlert'
import { usePendingActions } from '../../src/kitchen/usePendingActions'
import { TicketCard } from '../../src/components/kitchen/TicketCard'
import { ItemTotalsSheet } from '../../src/components/kitchen/ItemTotalsSheet'
import { MessageWaiterSheet } from '../../src/components/kitchen/MessageWaiterSheet'
import { ClearedSheet } from '../../src/components/kitchen/ClearedSheet'

/** At this width the three stages sit side by side; below it they become tabs. */
const BOARD_MIN_WIDTH = 700

/** Timers only show whole minutes, so a quarter-minute tick is plenty. */
const TICK_MS = 15 * 1000

const TOAST_MS = 4000

const STAGES: { key: Stage; label: string; color: string; empty: string }[] = [
  { key: 'new', label: 'New', color: K.blue, empty: 'No new tickets' },
  { key: 'cooking', label: 'Cooking', color: K.orange, empty: 'Nothing on the stove' },
  { key: 'ready', label: 'Ready', color: K.green, empty: 'Nothing waiting for pickup' },
]

interface Toast {
  text: string
  action?: { label: string; onPress: () => void }
}

export default function KitchenBoardScreen() {
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const isBoard = width >= BOARD_MIN_WIDTH

  const { prefs, update: updatePrefs } = useKitchenPrefs()
  const { dismissed, dismiss, restore, restoreAll, prune } = useDismissedTickets()
  const [orders, setOrders] = useState<Order[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [tab, setTab] = useState<Stage>('new')
  const [toast, setToast] = useState<Toast | null>(null)
  const [messageFor, setMessageFor] = useState<Order | null>(null)
  const [showTotals, setShowTotals] = useState(false)
  const [showCleared, setShowCleared] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const alertNew = useNewOrderAlert(prefs.muted)
  // Through refs so `load` keeps one identity and the realtime channel is not torn down
  // and resubscribed every time a dependency changes.
  const alertNewRef = useRef(alertNew)
  alertNewRef.current = alertNew
  const pruneRef = useRef(prune)
  pruneRef.current = prune

  const load = useCallback(async () => {
    try {
      const data = await fetchKitchenOrders()
      setOrders(data)
      pruneRef.current(new Set(data.map((o) => o.id)))
      const fresh = alertNewRef.current(data)
      if (fresh.length > 0) {
        const first = fresh[0]
        showToast({
          text: `New order · #${first.kot_number} ${first.table_name || 'Counter'}`
            + (fresh.length > 1 ? ` + ${fresh.length - 1} more` : ''),
        })
      }
    } catch (err) {
      console.error('Failed to load kitchen orders', err)
    }
  }, [showToast])

  const pending = usePendingActions(load)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // ── Derived board ──

  const stations = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) for (const i of o.items) if (i.station) set.add(i.station)
    return [...set].sort()
  }, [orders])

  // A station saved on this device that no current ticket uses is still a valid choice
  // (the tandoor is just quiet), so it stays in the chip row.
  const stationChips = useMemo(
    () => (prefs.station && !stations.includes(prefs.station) ? [...stations, prefs.station].sort() : stations),
    [stations, prefs.station],
  )

  const board = useMemo(() => {
    const dismissedSet = new Set(dismissed)
    const view = pending.overlay(orders).map((o) => filterByStation(o, prefs.station))
    const columns: Record<Stage, Order[]> = { new: [], cooking: [], ready: [] }
    const cancelled: Order[] = []
    const cleared: Order[] = []

    for (const o of view) {
      if (o.items.length === 0) continue // nothing for this station
      if (o.status === 'cancelled') {
        if (!dismissedSet.has(o.id)) cancelled.push(o)
        continue
      }
      const stage = stageOf(o.items)
      if (!stage) continue
      if (stage === 'ready' && dismissedSet.has(o.id)) {
        cleared.push(o)
        continue
      }
      columns[stage].push(o)
    }
    const totals = itemTotals([...columns.new, ...columns.cooking])
    return { columns, cancelled, cleared, totals }
  }, [orders, pending.overlay, prefs.station, dismissed])

  const totalsCount = board.totals.reduce((n, r) => n + r.toStart + r.cooking, 0)

  // ── Actions ──

  const advanceItem = useCallback((order: Order, item: OrderItem) => {
    const target = item.status === 'ordered' ? 'cooking' : 'ready'
    pending.queue(
      `${item.qty}× ${item.menu_item_name} → ${target === 'cooking' ? 'cooking' : 'ready'}`,
      [item.id],
      target,
    )
  }, [pending.queue])

  // The ticket passed in is already station-filtered, so bumping only moves this
  // station's items; the grill's tablet cannot mark the drinks ready.
  const bump = useCallback((order: Order) => {
    const toStart = order.items.filter((i) => i.status === 'ordered').map((i) => i.id)
    if (toStart.length > 0) {
      pending.queue(`#${order.kot_number} started`, toStart, 'cooking')
      return
    }
    const cooking = order.items.filter((i) => i.status === 'cooking').map((i) => i.id)
    pending.queue(`#${order.kot_number} ready`, cooking, 'ready')
  }, [pending.queue])

  /**
   * "I marked that ready by mistake." Inside the undo window the change never left the
   * device, so it is just dropped. After that it goes to the server, which puts the dish
   * back to cooking, withdraws the waiter's ready alert and tells them not to serve.
   */
  const recallItem = useCallback((order: Order, item: OrderItem) => {
    if (pending.dropItem(item.id)) {
      showToast({ text: `${item.qty}× ${item.menu_item_name} change undone` })
      return
    }

    // Ready items on this ticket split two ways: ones still held on the device (dropped
    // locally) and ones the server already has (recalled through the RPC).
    const ready = order.items.filter((i) => i.status === 'ready')
    const held = ready.filter((i) => pending.isHeld(i.id)).map((i) => i.id)
    const sent = ready.filter((i) => !pending.isHeld(i.id)).map((i) => i.id)

    async function recall(ids: string[], label: string) {
      try {
        if (ids.length > 0) await recallItems(ids)
        await load()
        showToast({ text: `${label} back to cooking · waiter told not to serve` })
      } catch (err: any) {
        Alert.alert('Could not send back', err?.message || 'Please try again.')
        await load()
      }
    }

    const itemLabel = `${item.qty}× ${item.menu_item_name}`
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Cancel', style: 'cancel' },
    ]
    if (ready.length > 1) {
      buttons.push({
        text: `Whole ticket (${ready.length})`,
        onPress: () => {
          held.forEach((id) => pending.dropItem(id))
          void recall(sent, `#${order.kot_number}`)
        },
      })
    }
    buttons.push({
      text: ready.length > 1 ? 'This item' : 'Send back',
      style: 'destructive',
      onPress: () => void recall([item.id], itemLabel),
    })

    Alert.alert(
      'Not actually ready?',
      `${itemLabel} on #${order.kot_number} goes back to Cooking. The waiter's "ready" alert is withdrawn and they are told not to serve it.`,
      buttons,
    )
  }, [pending.dropItem, pending.isHeld, load, showToast])

  const clearTicket = useCallback((order: Order) => {
    dismiss(order.id)
    showToast({
      text: order.status === 'cancelled' ? `#${order.kot_number} cancellation noted` : `#${order.kot_number} cleared from screen`,
      action: { label: 'Undo', onPress: () => { restore(order.id); setToast(null) } },
    })
  }, [dismiss, restore, showToast])

  const onMessageSent = useCallback((order: Order) => {
    showToast({ text: `Message sent to the waiter for #${order.kot_number}` })
  }, [showToast])

  // ── Header ──

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => setShowTotals(true)}
            hitSlop={6}
            accessibilityLabel="Item totals"
          >
            <Ionicons name="list-outline" size={20} color={K.orange} />
            {totalsCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{totalsCount > 99 ? '99+' : totalsCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.headerBtn, prefs.muted && styles.headerBtnMuted]}
            onPress={() => updatePrefs({ muted: !prefs.muted })}
            hitSlop={6}
            accessibilityLabel={prefs.muted ? 'Turn order sound on' : 'Mute order sound'}
          >
            <Ionicons
              name={prefs.muted ? 'volume-mute' : 'volume-high-outline'}
              size={20}
              color={prefs.muted ? K.red : K.orange}
            />
          </Pressable>
        </View>
      ),
    })
  }, [navigation, totalsCount, prefs.muted, updatePrefs])

  // ── Render ──

  function renderTicket(order: Order, stage: Stage) {
    return (
      <TicketCard
        order={order}
        stage={stage}
        now={now}
        onAdvanceItem={advanceItem}
        onRecallItem={recallItem}
        onBump={bump}
        onDismiss={clearTicket}
        onMessage={setMessageFor}
      />
    )
  }

  function clearedFooter() {
    if (board.cleared.length === 0) return null
    return (
      <Pressable style={styles.clearedLink} onPress={() => setShowCleared(true)}>
        <Ionicons name="eye-outline" size={14} color={K.textMuted} />
        <Text style={styles.clearedText}>
          {board.cleared.length} cleared ticket{board.cleared.length === 1 ? '' : 's'} · view
        </Text>
      </Pressable>
    )
  }

  function column(stage: Stage, opts: { showHeader: boolean }) {
    const meta = STAGES.find((s) => s.key === stage)!
    const data = board.columns[stage]
    return (
      <View style={opts.showHeader ? styles.column : styles.flex}>
        {opts.showHeader && (
          <View style={styles.columnHeader}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <Text style={styles.columnTitle}>{meta.label}</Text>
            <View style={[styles.countPill, { backgroundColor: meta.color }]}>
              <Text style={styles.countText}>{data.length}</Text>
            </View>
          </View>
        )}
        <FlatList
          data={data}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => renderTicket(item, stage)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={K.orange} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#d4d4d4" />
              <Text style={styles.emptyText}>{meta.empty}</Text>
            </View>
          }
          ListFooterComponent={stage === 'ready' ? clearedFooter() : null}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {stationChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBar}
          contentContainerStyle={styles.chipRow}
        >
          {[null, ...stationChips].map((s) => {
            const active = prefs.station === s
            return (
              <Pressable
                key={s ?? '__all'}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => updatePrefs({ station: s })}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s ?? 'All stations'}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {board.cancelled.map((o) => (
        <View key={o.id} style={styles.cancelStrip}>
          <Ionicons name="close-circle" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cancelTitle}>#{o.kot_number} · {o.table_name || 'Counter'} was cancelled</Text>
            <Text style={styles.cancelItems} numberOfLines={2}>
              Stop: {o.items.map((i) => `${i.qty}× ${i.menu_item_name}`).join(', ')}
            </Text>
          </View>
          <Pressable style={styles.cancelAck} onPress={() => clearTicket(o)}>
            <Text style={styles.cancelAckText}>Got it</Text>
          </Pressable>
        </View>
      ))}

      {isBoard ? (
        <View style={styles.board}>
          {STAGES.map((s) => (
            <View key={s.key} style={styles.flex}>{column(s.key, { showHeader: true })}</View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {STAGES.map((s) => {
              const active = tab === s.key
              const count = board.columns[s.key].length
              return (
                <Pressable
                  key={s.key}
                  style={[styles.tab, active && { backgroundColor: s.color }]}
                  onPress={() => setTab(s.key)}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{s.label}</Text>
                  <View style={[styles.tabCount, active ? styles.tabCountActive : { backgroundColor: s.color }]}>
                    <Text style={[styles.tabCountText, active && { color: s.color }]}>{count}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
          {column(tab, { showHeader: false })}
        </>
      )}

      {(pending.latest || toast) && (
        <View style={styles.snackWrap} pointerEvents="box-none">
          <View style={styles.snack}>
            <Text style={styles.snackText} numberOfLines={2}>
              {pending.latest ? pending.latest.label : toast!.text}
            </Text>
            {pending.latest ? (
              <Pressable onPress={() => pending.undo(pending.latest!.id)} hitSlop={10} style={styles.snackBtn}>
                <Text style={styles.snackAction}>UNDO</Text>
              </Pressable>
            ) : toast!.action ? (
              <Pressable onPress={toast!.action.onPress} hitSlop={10} style={styles.snackBtn}>
                <Text style={styles.snackAction}>{toast!.action.label.toUpperCase()}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <ItemTotalsSheet
        visible={showTotals}
        rows={board.totals}
        station={prefs.station}
        onClose={() => setShowTotals(false)}
      />
      <MessageWaiterSheet order={messageFor} onClose={() => setMessageFor(null)} onSent={onMessageSent} />
      <ClearedSheet
        visible={showCleared}
        orders={board.cleared}
        onRestore={(o) => restore(o.id)}
        onRestoreAll={() => { restoreAll(); setShowCleared(false) }}
        onClose={() => setShowCleared(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  flex: { flex: 1 },

  headerActions: { flexDirection: 'row', gap: 8, marginRight: 12 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: K.orangeSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtnMuted: { backgroundColor: K.redSoft },
  headerBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: K.orange, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: K.orangeLight,
  },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  chipBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: K.border, backgroundColor: '#fff' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: K.bg, borderWidth: 1, borderColor: '#e5e5e5',
  },
  chipActive: { backgroundColor: K.orange, borderColor: K.orange },
  chipText: { fontSize: 13, fontWeight: '700', color: '#555' },
  chipTextActive: { color: '#fff' },

  cancelStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: K.red,
    marginHorizontal: 12, marginTop: 10, borderRadius: 12, padding: 12,
  },
  cancelTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelItems: { color: '#fee2e2', fontSize: 13, marginTop: 2 },
  cancelAck: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  cancelAckText: { color: K.redDark, fontWeight: '800' },

  board: { flex: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingTop: 10 },
  column: { flex: 1, backgroundColor: '#f3f3f3', borderRadius: 14 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  columnTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: K.text },
  countPill: { minWidth: 26, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignItems: 'center' },
  countText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  listContent: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 90 },

  tabs: {
    flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 10, marginBottom: 6,
    padding: 4, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: K.border,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  tabText: { fontSize: 14, fontWeight: '700', color: '#555' },
  tabTextActive: { color: '#fff' },
  tabCount: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, alignItems: 'center' },
  tabCountActive: { backgroundColor: '#fff' },
  tabCountText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, color: K.textFaint },
  clearedLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  clearedText: { fontSize: 12, color: K.textMuted, fontWeight: '500' },

  snackWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', paddingHorizontal: 12 },
  snack: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: 520,
    backgroundColor: '#1f1f1f', borderRadius: 12, paddingLeft: 16, paddingRight: 8, minHeight: 52,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  snackText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', paddingVertical: 12 },
  snackBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  snackAction: { color: '#FDBA8C', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
})
