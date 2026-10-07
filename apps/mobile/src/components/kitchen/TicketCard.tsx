import { memo, useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Order, OrderItem } from '../../lib/types'
import { K } from '../../kitchen/theme'
import {
  elapsedMinutes,
  isLive,
  noteNeedsAlert,
  ordinal,
  targetMinutes,
  timerLevel,
  type Stage,
  type TimerLevel,
} from '../../kitchen/ticket'

/** A ticket younger than this wears a NEW badge, so a fresh KOT stands out on a busy board. */
const NEW_BADGE_MS = 60 * 1000

interface Props {
  order: Order
  stage: Stage
  now: number
  onAdvanceItem: (order: Order, item: OrderItem) => void
  /** Tap on a ready item: the "I marked that by mistake" path. */
  onRecallItem: (order: Order, item: OrderItem) => void
  onBump: (order: Order) => void
  onDismiss: (order: Order) => void
  onMessage: (order: Order) => void
}

const TIMER_COLORS: Record<TimerLevel, { fg: string; bg: string }> = {
  ok: { fg: K.greenDark, bg: K.greenSoft },
  warn: { fg: K.amberDark, bg: K.amberSoft },
  late: { fg: '#fff', bg: K.red },
}

function TimerPill({ minutes, level, ready }: { minutes: number; level: TimerLevel; ready: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current
  const late = level === 'late' && !ready

  useEffect(() => {
    if (!late) { pulse.setValue(1); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [late, pulse])

  // A ready ticket is waiting on a waiter, not the kitchen, so its clock goes neutral
  // instead of screaming for attention the cooks cannot act on.
  const colors = ready ? { fg: K.textMuted, bg: K.divider } : TIMER_COLORS[level]

  return (
    <Animated.View style={[styles.timer, { backgroundColor: colors.bg, opacity: pulse }]}>
      <Ionicons name="time-outline" size={14} color={colors.fg} />
      <Text style={[styles.timerText, { color: colors.fg }]}>{minutes}m</Text>
    </Animated.View>
  )
}

function ItemRow({ item, onPress, onRecall }: { item: OrderItem; onPress: () => void; onRecall: () => void }) {
  if (item.status === 'cancelled') {
    return (
      <View style={[styles.itemRow, styles.itemRowCancelled]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, styles.struck]}>
            {item.qty}× {item.menu_item_name}
            {item.variant_name ? ` (${item.variant_name})` : ''}
          </Text>
          {item.cancel_reason ? <Text style={styles.cancelReason}>{item.cancel_reason}</Text> : null}
        </View>
        <View style={styles.cancelTag}>
          <Text style={styles.cancelTagText}>CANCELLED</Text>
        </View>
      </View>
    )
  }

  const alert = noteNeedsAlert(item.notes)
  const advances = item.status === 'ordered' || item.status === 'cooking'
  const recallable = item.status === 'ready'

  return (
    <Pressable
      style={({ pressed }) => [styles.itemRow, pressed && (advances || recallable) && styles.itemRowPressed]}
      onPress={advances ? onPress : recallable ? onRecall : undefined}
      accessibilityRole={advances || recallable ? 'button' : undefined}
      accessibilityLabel={
        item.status === 'ordered' ? `Start ${item.menu_item_name}`
          : item.status === 'cooking' ? `Mark ${item.menu_item_name} ready`
            : recallable ? `Send ${item.menu_item_name} back to cooking`
              : undefined
      }
    >
      <View style={[styles.statusBar, { backgroundColor: STATUS_BAR[item.status] ?? K.textFaint }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, item.status === 'ready' && styles.itemNameDone]}>
          <Text style={styles.qty}>{item.qty}× </Text>
          {item.menu_item_name}
          {item.variant_name ? <Text style={styles.variant}> ({item.variant_name})</Text> : null}
        </Text>
        {item.addons.length > 0 && (
          <Text style={styles.addonText}>+ {item.addons.map((a) => a.name).join(', ')}</Text>
        )}
        {item.notes ? (
          <View style={[styles.noteBox, alert && styles.noteBoxAlert]}>
            <Ionicons name={alert ? 'warning' : 'chatbox-ellipses-outline'} size={14} color={alert ? K.redDark : K.amberDark} />
            <Text style={[styles.noteText, alert && styles.noteTextAlert]}>{item.notes}</Text>
          </View>
        ) : null}
        {item.station ? <Text style={styles.stationText}>{item.station}</Text> : null}
      </View>
      <View style={[styles.itemChip, CHIP[item.status]?.box]}>
        <Text style={[styles.itemChipText, CHIP[item.status]?.text]}>
          {item.status === 'ordered' ? 'Start' : item.status === 'cooking' ? 'Ready' : '✓ Ready'}
        </Text>
        {recallable && <Ionicons name="arrow-undo" size={13} color={K.greenDark} />}
      </View>
    </Pressable>
  )
}

const STATUS_BAR: Record<string, string> = {
  ordered: K.blue,
  cooking: K.orange,
  ready: K.green,
}

// The chip names the *next* action for live items, so the cook reads "tap = Start".
const CHIP: Record<string, { box: object; text: object }> = {
  ordered: { box: { backgroundColor: K.orange }, text: { color: '#fff' } },
  cooking: { box: { backgroundColor: K.green }, text: { color: '#fff' } },
  ready: { box: { backgroundColor: K.greenSoft }, text: { color: K.greenDark } },
}

function TicketCardImpl({ order, stage, now, onAdvanceItem, onRecallItem, onBump, onDismiss, onMessage }: Props) {
  const elapsed = elapsedMinutes(order.created_at, now)
  const level = timerLevel(elapsed, targetMinutes(order.items))
  const isReady = stage === 'ready'
  const isNew = now - new Date(order.created_at).getTime() < NEW_BADGE_MS
  const seq = order.session_kot_seq ?? 1

  // Served items are history; cancelled ones stay visible, struck through, so a cook who
  // already started one knows to stop.
  const items = order.items.filter((i) => i.status !== 'served' && i.status !== 'wasted')
  const toStart = items.filter((i) => i.status === 'ordered').length
  const cooking = items.filter((i) => i.status === 'cooking').length
  const liveCount = order.items.filter(isLive).length

  return (
    <View style={[
      styles.card,
      level === 'late' && !isReady && styles.cardLate,
      isReady && styles.cardReady,
    ]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.kotRow}>
            <Text style={styles.kot}>#{order.kot_number}</Text>
            <Text style={styles.table} numberOfLines={1}>{order.table_name || 'Counter'}</Text>
            {isNew && (
              <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
            )}
          </View>
          <Text style={styles.source} numberOfLines={1}>
            {order.source === 'customer' ? `QR · ${order.placed_by_name || 'Guest'}` : order.placed_by_name ?? order.source}
            {' · '}{liveCount} item{liveCount === 1 ? '' : 's'}
          </Text>
        </View>
        <TimerPill minutes={elapsed} level={level} ready={isReady} />
        <Pressable
          style={styles.iconBtn}
          onPress={() => onMessage(order)}
          hitSlop={6}
          accessibilityLabel={`Message the waiter about KOT ${order.kot_number}`}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={K.orange} />
        </Pressable>
      </View>

      {seq > 1 && (
        <View style={styles.addonBanner}>
          <Ionicons name="add-circle" size={14} color={K.orange} />
          <Text style={styles.addonBannerText}>Add-on · {ordinal(seq)} order for this table</Text>
        </View>
      )}

      {isReady && (
        <View style={styles.readyBanner}>
          <Ionicons name="checkmark-circle" size={14} color={K.green} />
          <Text style={styles.readyBannerText}>Ready — waiting for a waiter to serve</Text>
        </View>
      )}

      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onPress={() => onAdvanceItem(order, item)}
          onRecall={() => onRecallItem(order, item)}
        />
      ))}

      {toStart > 0 ? (
        <Pressable style={[styles.bump, { backgroundColor: K.orange }]} onPress={() => onBump(order)}>
          <Ionicons name="flame" size={18} color="#fff" />
          <Text style={styles.bumpText}>{cooking > 0 ? `Start remaining (${toStart})` : 'Start all'}</Text>
        </Pressable>
      ) : cooking > 0 ? (
        <Pressable style={[styles.bump, { backgroundColor: K.green }]} onPress={() => onBump(order)}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
          <Text style={styles.bumpText}>All ready</Text>
        </Pressable>
      ) : isReady ? (
        <Pressable style={[styles.bump, styles.bumpOutline]} onPress={() => onDismiss(order)}>
          <Ionicons name="eye-off-outline" size={18} color={K.textMuted} />
          <Text style={[styles.bumpText, { color: K.textMuted }]}>Clear from screen</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export const TicketCard = memo(TicketCardImpl)

const styles = StyleSheet.create({
  card: {
    backgroundColor: K.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: K.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  cardLate: { borderLeftWidth: 5, borderLeftColor: K.red },
  cardReady: { borderLeftWidth: 5, borderLeftColor: K.green },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  kotRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  kot: { fontSize: 22, fontWeight: '800', color: K.text },
  table: { fontSize: 16, fontWeight: '700', color: K.orange, flexShrink: 1 },
  newBadge: { backgroundColor: K.blue, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'center' },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  source: { fontSize: 12, color: K.textMuted, marginTop: 2 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  timerText: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: K.orangeSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  addonBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K.orangeLight,
    borderWidth: 1, borderColor: K.orangeBorder, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10, marginBottom: 8,
  },
  addonBannerText: { fontSize: 12, color: K.orange, fontWeight: '700' },
  readyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K.greenSoft,
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8,
  },
  readyBannerText: { fontSize: 12, color: K.greenDark, fontWeight: '600' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: K.divider,
  },
  itemRowPressed: { backgroundColor: K.orangeLight },
  itemRowCancelled: { backgroundColor: K.redSoft, borderRadius: 8, paddingHorizontal: 8, borderTopWidth: 0, marginTop: 4 },
  statusBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  qty: { fontWeight: '800' },
  itemName: { fontSize: 17, fontWeight: '600', color: K.text },
  itemNameDone: { color: K.textMuted },
  variant: { fontWeight: '500', color: K.textMuted },
  struck: { textDecorationLine: 'line-through', color: K.redDark },
  cancelReason: { fontSize: 12, color: K.redDark, marginTop: 2 },
  cancelTag: { backgroundColor: K.red, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  cancelTagText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  addonText: { fontSize: 13, color: K.textMuted, marginTop: 2 },
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: K.amberSoft,
    borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, marginTop: 5, alignSelf: 'flex-start',
  },
  noteBoxAlert: { backgroundColor: K.redSoft, borderWidth: 1, borderColor: '#fecaca' },
  noteText: { fontSize: 14, fontWeight: '700', color: K.amberDark, flexShrink: 1 },
  noteTextAlert: { color: K.redDark },
  stationText: { fontSize: 11, color: K.blue, fontWeight: '600', marginTop: 3 },
  itemChip: {
    minWidth: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  itemChipText: { fontSize: 14, fontWeight: '800' },
  bump: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12, marginTop: 10,
  },
  bumpOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  bumpText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
