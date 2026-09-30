import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  fetchKitchenOrders,
  fetchRecentlyServed,
  markItemsCooking,
  markItemsNew,
  markItemsReady,
  markItemServed,
  recordWaste,
  type WasteReason,
} from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import type { Order, OrderItem } from '../../src/lib/types'
import { useKdsSettings } from '../../src/kds/settings'
import {
  CARDS_PER_COLUMN,
  FOUR_COLUMN_MIN_WIDTH,
  STAGES,
  stageColor,
  screenClassFor,
  stageOfOrder,
  themeFor,
  touchSize,
  typeScale,
  type KdsTheme,
  type Stage,
} from '../../src/kds/theme'
import { KotCard } from '../../src/components/kds/KotCard'
import { WasteDialog, type WasteTarget } from '../../src/components/kds/WasteDialog'
import { AllDayPanel } from '../../src/components/kds/AllDayPanel'

interface UndoAction {
  label: string
  itemIds: string[]
  revertTo: 'ordered' | 'cooking' | 'ready'
}

export default function KitchenBoard() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { settings, update, loaded } = useKdsSettings()
  // Tab bar height from the kitchen layout (60 + bottom inset), plus room for the undo bar.
  const bottomClearance = 60 + insets.bottom + 16
  const screen = screenClassFor(width)
  const theme = themeFor(settings)
  const t = typeScale(screen, settings.fontScale)
  const touch = touchSize(screen)
  const isPhone = screen === 'phone'

  const [orders, setOrders] = useState<Order[]>([])
  const [servedOrders, setServedOrders] = useState<Order[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [wasteTarget, setWasteTarget] = useState<WasteTarget | null>(null)
  const [undo, setUndo] = useState<UndoAction | null>(null)
  const [phoneStage, setPhoneStage] = useState<Stage>('new')
  const [flash, setFlash] = useState(false)

  // Re-render once a second so the age timers and colour thresholds stay live without
  // refetching anything.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const knownOrderIds = useRef<Set<string>>(new Set())
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchKitchenOrders()

      // Announce genuinely new tickets, not the first load (which would alarm on every
      // app start) and not re-renders of tickets already on the board.
      const incoming = data.filter((o) => !knownOrderIds.current.has(o.id))
      const firstLoad = knownOrderIds.current.size === 0
      if (!firstLoad && incoming.length > 0 && settings.soundEnabled) {
        Vibration.vibrate(400)
        setFlash(true)
        setTimeout(() => setFlash(false), 1200)
      }
      knownOrderIds.current = new Set(data.map((o) => o.id))
      setOrders(data)

      // The Served column is a short memory, not a log: what just went out, so staff can
      // confirm it or pull one back. The full record lives under History.
      try { setServedOrders(await fetchRecentlyServed(12)) } catch { /* non-critical */ }
    } catch (err) {
      console.error('Failed to load kitchen orders', err)
    }
  }, [settings.soundEnabled])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('kitchen-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // Realtime can be missed on a tablet that has been idle; a slow poll keeps the board
  // truthful without hammering the API.
  useEffect(() => {
    const timer = setInterval(() => { void load() }, 20_000)
    return () => clearInterval(timer)
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function armUndo(action: UndoAction) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo(action)
    undoTimer.current = setTimeout(() => setUndo(null), 6000)
  }

  const stationsAvailable = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) for (const i of o.items) if (i.station) set.add(i.station)
    return [...set].sort()
  }, [orders])

  /** Station filter hides items, and a ticket with nothing left for this station. */
  const visibleOrders = useMemo(() => {
    if (!settings.station) return orders
    return orders
      .map((o) => ({ ...o, items: o.items.filter((i) => i.station === settings.station) }))
      .filter((o) => o.items.length > 0)
  }, [orders, settings.station])

  const byStage = useMemo(() => {
    const map: Record<Stage, Order[]> = { new: [], preparing: [], ready: [], served: [] }
    for (const o of visibleOrders) {
      const stage = stageOfOrder(o.items)
      if (stage !== 'served') map[stage].push(o)
    }
    map.served = servedOrders
    // Oldest first in the working columns: the chef's next job is always at the top.
    for (const key of ['new', 'preparing', 'ready'] as const) {
      map[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return map
  }, [visibleOrders, servedOrders])

  async function advance(order: Order) {
    const stage = stageOfOrder(order.items)
    const live = order.items.filter((i) => i.status !== 'cancelled' && i.status !== 'wasted')
    try {
      if (stage === 'new') {
        const ids = live.filter((i) => i.status === 'ordered').map((i) => i.id)
        await markItemsCooking(ids)
        armUndo({ label: `KOT #${order.kot_number} started`, itemIds: ids, revertTo: 'ordered' })
      } else if (stage === 'preparing') {
        const ids = live.filter((i) => i.status === 'cooking').map((i) => i.id)
        await markItemsReady(ids)
        armUndo({ label: `KOT #${order.kot_number} ready`, itemIds: ids, revertTo: 'cooking' })
      } else {
        const ids = live.filter((i) => i.status === 'ready').map((i) => i.id)
        await markItemServed(ids)
        armUndo({ label: `KOT #${order.kot_number} served`, itemIds: ids, revertTo: 'ready' })
      }
      await load()
    } catch (err) {
      console.error('Could not advance ticket', err)
    }
  }

  /** Drag target: move every live item of a ticket to the dropped column. */
  async function moveToStage(order: Order, stage: Stage) {
    const current = stageOfOrder(order.items)
    if (current === stage) return
    const live = order.items.filter((i) => i.status !== 'cancelled' && i.status !== 'wasted')
    const ids = live.map((i) => i.id)
    if (ids.length === 0) return
    const revertTo =
      current === 'new' ? 'ordered' : current === 'preparing' ? 'cooking' : 'ready'
    try {
      if (stage === 'new') await markItemsNew(ids)
      else if (stage === 'preparing') await markItemsCooking(ids)
      else if (stage === 'ready') await markItemsReady(ids)
      else await markItemServed(ids)
      armUndo({ label: `KOT #${order.kot_number} → ${stage}`, itemIds: ids, revertTo })
      await load()
    } catch (err) {
      console.error('Could not move ticket', err)
    }
  }

  /** Explicit backward step. Kitchens do not run in a straight line. */
  async function moveBack(order: Order, to: Stage) {
    await moveToStage(order, to)
  }

  async function runUndo() {
    if (!undo) return
    try {
      if (undo.revertTo === 'ordered') await markItemsNew(undo.itemIds)
      else if (undo.revertTo === 'cooking') await markItemsCooking(undo.itemIds)
      else await markItemsReady(undo.itemIds)
      setUndo(null)
      await load()
    } catch (err) {
      console.error('Could not undo', err)
    }
  }

  async function confirmWaste(reason: WasteReason, note: string, reFire: boolean) {
    if (!wasteTarget) return
    const target = wasteTarget
    setWasteTarget(null)
    try {
      await recordWaste(target.orderItemId, reason, { note, reFire, qty: target.qty })
      await load()
    } catch (err) {
      console.error('Could not record waste', err)
    }
  }

  // ---- drag and drop -------------------------------------------------------
  // PanResponder + Animated are built into React Native, so touch dragging needs no extra
  // native dependency (gesture-handler/reanimated are not installed here).
  //
  // Everything the gesture reads lives in refs. A PanResponder captures the values from
  // the render that created it and keeps them for the whole gesture, so reading state
  // directly meant the drop handler always saw the hover column as it was at touch-down
  // (null) and the card never moved.
  const boardRef = useRef<View>(null)
  const boardOriginX = useRef(0)
  const columnWidth = useRef(0)
  const hoverRef = useRef<Stage | null>(null)
  const ordersRef = useRef(new Map<string, Order>())
  const columnsRef = useRef<typeof STAGES>(STAGES)
  const respondersRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>())

  const [dragOrderId, setDragOrderId] = useState<string | null>(null)
  const [hoverStage, setHoverStage] = useState<Stage | null>(null)
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current

  const dragEnabled = !isPhone && settings.view === 'board'

  // Keep the lookup the gesture uses in step with the latest data.
  ordersRef.current = new Map([...visibleOrders, ...servedOrders].map((o) => [o.id, o]))

  /** Absolute window position — onLayout gives coordinates relative to the parent, which
   *  cannot be compared with a touch's pageX. */
  const measureBoard = useCallback(() => {
    boardRef.current?.measureInWindow((x, _y, w) => {
      boardOriginX.current = x
      columnWidth.current = w / columnsRef.current.length
    })
  }, [])

  /**
   * Pan handlers for the whole card.
   *
   * The gesture is claimed only on a clearly HORIZONTAL movement. That single rule makes
   * three interactions coexist on the same surface without a handle:
   *   - a tap falls through to the buttons underneath (no capture phase is used)
   *   - a vertical swipe stays with the column's ScrollView
   *   - a horizontal drag moves the ticket between columns
   */
  function dragPropsFor(orderId: string) {
    if (!dragEnabled) return {}

    let responder = respondersRef.current.get(orderId)
    if (!responder) {
      responder = PanResponder.create({
        // No *Capture* variants: children must get first refusal so taps still work.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => {
          measureBoard()
          hoverRef.current = null
          setHoverStage(null)
          setDragOrderId(orderId)
          dragPos.setValue({ x: 0, y: 0 })
        },
        onPanResponderMove: (e, g) => {
          dragPos.setValue({ x: g.dx, y: g.dy })
          const w = columnWidth.current
          if (w > 0) {
            const idx = Math.floor((e.nativeEvent.pageX - boardOriginX.current) / w)
            const cols = columnsRef.current
            const next = cols[Math.max(0, Math.min(cols.length - 1, idx))].key
            if (next !== hoverRef.current) {
              hoverRef.current = next
              setHoverStage(next)
            }
          }
        },
        onPanResponderRelease: () => {
          const target = hoverRef.current
          const order = ordersRef.current.get(orderId)
          hoverRef.current = null
          setHoverStage(null)
          setDragOrderId(null)
          Animated.spring(dragPos, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 8,
          }).start()
          if (order && target && stageOfOrder(order.items) !== target) {
            void moveToStage(order, target)
          }
        },
        onPanResponderTerminate: () => {
          hoverRef.current = null
          setHoverStage(null)
          setDragOrderId(null)
          dragPos.setValue({ x: 0, y: 0 })
        },
      })
      respondersRef.current.set(orderId, responder)
    }
    return responder.panHandlers
  }

  function renderCard(order: Order) {
    return (
      <Animated.View
        key={order.id}
        {...dragPropsFor(order.id)}
        style={
          dragOrderId === order.id
            ? { transform: dragPos.getTranslateTransform(), zIndex: 999, elevation: 24 }
            : undefined
        }
      >
        <KotCard
          order={order}
          theme={theme}
          screen={screen}
          settings={settings}
          onAdvance={advance}
          onMoveBack={moveBack}
          onWaste={(_o: Order, item: OrderItem) =>
            setWasteTarget({ orderItemId: item.id, label: item.menu_item_name, qty: item.qty })
          }
          dragging={dragOrderId === order.id}
        />
      </Animated.View>
    )
  }

  if (!loaded) {
    return <View style={[styles.fill, { backgroundColor: theme.bg }]} />
  }

  const perColumn = settings.cardsPerRowOverride || CARDS_PER_COLUMN[screen]
  const columns = width >= FOUR_COLUMN_MIN_WIDTH ? STAGES : STAGES.filter((c) => c.key !== 'served')
  columnsRef.current = columns
  const cardMaxHeight = Math.max(220, (height - 220) / perColumn)

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      {/* New-order flash: a full-width bar is visible from across the kitchen, where a
          toast would not be. */}
      {flash && <View style={[styles.flash, { backgroundColor: theme.accent }]} />}

      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { fontSize: t.kot * 0.8, color: theme.text }]}>Kitchen</Text>

        <View style={styles.topActions}>
          <Text style={[styles.headerCount, { fontSize: t.meta + 2, color: theme.textDim }]}>
            {byStage.new.length + byStage.preparing.length} active
          </Text>
        </View>
      </View>

      {/* Station filter, built from the stations actually present on the board. */}
      {stationsAvailable.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stationRow} contentContainerStyle={styles.stationBar}>
          <StationChip label="All stations" active={!settings.station} onPress={() => update({ station: null })} theme={theme} t={t} touch={touch} />
          {stationsAvailable.map((s) => (
            <StationChip key={s} label={s} active={settings.station === s} onPress={() => update({ station: s })} theme={theme} t={t} touch={touch} />
          ))}
        </ScrollView>
      )}

      <View style={styles.body}>
        {settings.showAllDay && <AllDayPanel orders={visibleOrders} theme={theme} screen={screen} settings={settings} />}

        {/* Phone: one column at a time behind tabs. Everything else: full board. */}
        {isPhone && settings.view === 'board' ? (
          <>
            <View style={styles.tabs}>
              {columns.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setPhoneStage(s.key)}
                  style={[
                    styles.tab,
                    { minHeight: touch * 0.8, borderColor: theme.border },
                    phoneStage === s.key && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                >
                  <Text style={[styles.tabText, { fontSize: t.note, color: phoneStage === s.key ? '#fff' : theme.text }]}>
                    {s.label} ({byStage[s.key].length})
                  </Text>
                </Pressable>
              ))}
            </View>
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
              contentContainerStyle={[styles.columnContent, { paddingBottom: bottomClearance + 70 }]}
            >
              {byStage[phoneStage].map(renderCard)}
              {byStage[phoneStage].length === 0 && <Empty theme={theme} t={t} />}
            </ScrollView>
          </>
        ) : settings.view === 'grid' ? (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
            contentContainerStyle={[styles.columnContent, { paddingBottom: bottomClearance + 70 }]}
          >
            <View style={styles.grid}>
              {[...visibleOrders]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((o) => (
                  <View key={o.id} style={{ width: isPhone ? '100%' : `${100 / Math.max(1, perColumn > 3 ? 3 : perColumn)}%`, paddingHorizontal: 4 }}>
                    {renderCard(o)}
                  </View>
                ))}
            </View>
            {visibleOrders.length === 0 && <Empty theme={theme} t={t} />}
          </ScrollView>
        ) : (
          <View ref={boardRef} style={styles.board} onLayout={measureBoard}>
            {columns.map((s) => (
              <View
                key={s.key}
                style={[
                  styles.column,
                  {
                    backgroundColor: hoverStage === s.key ? theme.cardRaised : 'transparent',
                    borderColor: hoverStage === s.key ? theme.accent : 'transparent',
                  },
                ]}
              >
                <View style={[styles.columnHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons name={s.icon} size={t.item} color={stageColor(s.key, theme)} />
                  <Text style={[styles.columnTitle, { fontSize: t.item, color: theme.text }]}>
                    {s.label}
                  </Text>
                  <View style={[styles.countBadge, { backgroundColor: theme.cardRaised }]}>
                    <Text style={[styles.countText, { fontSize: t.meta, color: theme.text }]}>
                      {byStage[s.key].length}
                    </Text>
                  </View>
                </View>
                <ScrollView
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
                  contentContainerStyle={[styles.columnContent, { paddingBottom: bottomClearance + 70 }]}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={!dragOrderId}
                >
                  {byStage[s.key].map(renderCard)}
                  {byStage[s.key].length === 0 && <Empty theme={theme} t={t} />}
                </ScrollView>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Undo */}
      {undo && (
        <View style={[styles.undoBar, { bottom: bottomClearance, backgroundColor: theme.cardRaised, borderColor: theme.border }]}>
          <Text style={[styles.undoText, { fontSize: t.note, color: theme.text }]} numberOfLines={1}>
            {undo.label}
          </Text>
          <Pressable onPress={runUndo} style={[styles.undoBtn, { minHeight: touch * 0.72, backgroundColor: theme.accent }]}>
            <Ionicons name="arrow-undo" size={t.note + 2} color="#fff" />
            <Text style={[styles.undoBtnText, { fontSize: t.note }]}>Undo</Text>
          </Pressable>
        </View>
      )}

      <WasteDialog
        target={wasteTarget}
        theme={theme}
        screen={screen}
        settings={settings}
        onCancel={() => setWasteTarget(null)}
        onConfirm={confirmWaste}
      />
    </SafeAreaView>
  )
}

function StationChip({
  label, active, onPress, theme, t, touch,
}: {
  label: string
  active: boolean
  onPress: () => void
  theme: KdsTheme
  t: ReturnType<typeof typeScale>
  touch: number
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.stationChip,
        { minHeight: touch * 0.72, borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accent : 'transparent' },
      ]}
    >
      <Text style={[styles.stationText, { fontSize: t.note, color: active ? '#fff' : theme.text }]}>{label}</Text>
    </Pressable>
  )
}

function Empty({ theme, t }: { theme: KdsTheme; t: ReturnType<typeof typeScale> }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="checkmark-circle-outline" size={t.kot} color={theme.textDim} />
      <Text style={[styles.emptyText, { fontSize: t.note, color: theme.textDim }]}>Nothing here</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, zIndex: 100 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontWeight: '800' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCount: { fontWeight: '700' },
  iconBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  stationRow: { flexGrow: 0 },
  stationBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  stationChip: { justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, borderWidth: 2 },
  stationText: { fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, paddingHorizontal: 6 },
  tabText: { fontWeight: '800' },
  board: { flex: 1, flexDirection: 'row', gap: 8 },
  column: { flex: 1, borderRadius: 14, borderWidth: 2 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  columnTitle: { fontWeight: '800', flex: 1 },
  countBadge: { minWidth: 30, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  countText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  columnContent: { padding: 8, paddingBottom: 90 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { fontWeight: '600' },
  undoBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, zIndex: 60, elevation: 12 },
  undoText: { fontWeight: '700', flex: 1 },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 10 },
  undoBtnText: { color: '#fff', fontWeight: '800' },
})
