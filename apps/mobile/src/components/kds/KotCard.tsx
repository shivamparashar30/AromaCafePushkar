import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Order, OrderItem } from '../../lib/types'
import type { KdsSettings } from '../../kds/settings'
import {
  STAGES,
  ageOf,
  elapsedLabel,
  previousStage,
  stageColor,
  stageOfOrder,
  touchSize,
  typeScale,
  type KdsTheme,
  type ScreenClass,
  type Stage,
} from '../../kds/theme'

/** Veg / non-veg / egg square — a convention Indian kitchens read without thinking. */
function FoodDot({ type, size }: { type: string | null; size: number }) {
  const color = type === 'veg' ? '#1E9E54' : type === 'egg' ? '#D98324' : '#D93838'
  return (
    <View style={[styles.foodDot, { width: size, height: size, borderColor: color }]}>
      <View style={{ width: size / 2.3, height: size / 2.3, borderRadius: size, backgroundColor: color }} />
    </View>
  )
}

/** Only tags that change how a dish is cooked or who may eat it reach the line. */
const ALERT_TAGS = /jain|allerg|nut|gluten|dairy|halal|vegan|spicy/i

/**
 * One ticket. Reading order matches how a chef scans: KOT number, table, how long it has
 * been waiting, then the food. Everything a chef cannot act on while cooking — waiter
 * name, prices, internal ids — is deliberately absent.
 */
export const KotCard = memo(function KotCard({
  order,
  theme,
  screen,
  settings,
  onAdvance,
  onMoveBack,
  onWaste,
  dragging,
}: {
  order: Order
  theme: KdsTheme
  screen: ScreenClass
  settings: KdsSettings
  onAdvance: (order: Order) => void
  onMoveBack: (order: Order, to: Stage) => void
  onWaste: (order: Order, item: OrderItem) => void
  dragging?: boolean
}) {
  const t = typeScale(screen, settings.fontScale)
  const touch = touchSize(screen)
  const stage: Stage = stageOfOrder(order.items)
  const age = ageOf(order.created_at, settings)
  const back = previousStage(stage)
  const accent = stageColor(stage, theme)
  const stageMeta = STAGES.find((s) => s.key === stage)!

  const liveItems = order.items.filter((i) => i.status !== 'cancelled' && i.status !== 'wasted')
  const wastedItems = order.items.filter((i) => i.status === 'wasted')

  // Colour carries one meaning only: how late this ticket is.
  const ageColor = age === 'urgent' ? theme.urgent : age === 'warn' ? theme.warn : null

  // "Serve all" is the whole point at the Ready stage — a chef should never tick three
  // items to send one tray out.
  const action =
    stage === 'new' ? 'Start preparing'
    : stage === 'preparing' ? 'Mark ready'
    : stage === 'ready' ? `Serve all (${liveItems.length})`
    : null

  const isTakeaway = order.table_name === '' || /counter/i.test(order.table_name)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: ageColor ?? theme.border,
          borderWidth: ageColor ? 2 : 1,
          opacity: dragging ? 0.95 : 1,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: accent }]} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.kot, { fontSize: t.kot, color: theme.text }]} numberOfLines={1}>
            KOT #{order.kot_number}
          </Text>
          <Text style={[styles.table, { fontSize: t.item, color: theme.text }]} numberOfLines={1}>
            {isTakeaway ? 'Takeaway' : order.table_name}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {order.is_priority && (
            <View style={[styles.vip, { backgroundColor: theme.accent }]}>
              <Text style={[styles.vipText, { fontSize: t.meta }]}>VIP</Text>
            </View>
          )}
          <View style={styles.timerRow}>
            {ageColor && <Ionicons name="alarm" size={t.timer * 0.8} color={ageColor} />}
            <Text style={[styles.timer, { fontSize: t.timer, color: ageColor ?? theme.textDim }]}>
              {elapsedLabel(order.created_at)}
            </Text>
          </View>
        </View>
      </View>

      {/* Status as a labelled chip, so the state never depends on colour alone. */}
      <View style={styles.statusRow}>
        <View style={[styles.statusChip, { borderColor: accent }]}>
          <Ionicons name={stageMeta.icon} size={t.meta + 3} color={accent} />
          <Text style={[styles.statusText, { fontSize: t.meta + 1, color: accent }]}>
            {stageMeta.label.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.items}>
        {liveItems.map((item) => {
          const alerts = (item.tags ?? []).filter((tag) => ALERT_TAGS.test(tag))
          return (
            <View key={item.id} style={[styles.itemRow, { borderTopColor: theme.border }]}>
              <View style={styles.itemBody}>
                <View style={styles.itemNameRow}>
                  <FoodDot type={item.food_type} size={t.item * 0.7} />
                  <Text style={[styles.itemName, { fontSize: t.item, color: theme.text }]}>
                    <Text style={{ color: theme.accent }}>{item.qty} × </Text>
                    {item.menu_item_name}
                    {item.variant_name ? ` (${item.variant_name})` : ''}
                  </Text>
                </View>

                {item.addons.length > 0 && (
                  <Text style={[styles.sub, { fontSize: t.note, color: theme.textDim }]}>
                    + {item.addons.map((a) => a.name).join(', ')}
                  </Text>
                )}

                {/* The one thing on a ticket that must never be skimmed past. */}
                {(item.notes || alerts.length > 0) && (
                  <View style={[styles.noteBox, { backgroundColor: theme.noteBg }]}>
                    <Text style={[styles.noteText, { fontSize: t.note, color: theme.noteText }]}>
                      {[item.notes, ...alerts].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                )}
              </View>

              {stage !== 'served' && (
                <Pressable
                  onPress={() => onWaste(order, item)}
                  hitSlop={10}
                  style={[styles.itemAction, { width: touch * 0.66, height: touch * 0.66 }]}
                  accessibilityLabel={`Report a problem with ${item.menu_item_name}`}
                >
                  <Ionicons name="alert-circle-outline" size={t.item} color={theme.textDim} />
                </Pressable>
              )}
            </View>
          )
        })}

        {wastedItems.map((item) => (
          <View key={item.id} style={[styles.itemRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.sub, { fontSize: t.note, color: theme.danger }]}>
              {item.qty} × {item.menu_item_name} · wasted
            </Text>
          </View>
        ))}
      </View>

      {/* Back is always available and always in the same place, because kitchens do not
          run in a straight line. Forward is the big one. */}
      <View style={styles.actions}>
        {back && (
          <Pressable
            onPress={() => onMoveBack(order, back)}
            style={[styles.backBtn, { minHeight: touch, minWidth: touch, borderColor: theme.border }]}
            accessibilityLabel={`Move back to ${back}`}
          >
            <Ionicons name="arrow-back" size={t.item} color={theme.textDim} />
          </Pressable>
        )}
        {action && (
          <Pressable
            onPress={() => onAdvance(order)}
            style={[styles.primary, { backgroundColor: theme.accent, minHeight: touch }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { fontSize: t.item }]}>{action}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  stripe: { height: 5, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 8, gap: 10 },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kot: { fontWeight: '800', letterSpacing: -0.5 },
  table: { fontWeight: '600', marginTop: 2 },
  vip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  vipText: { color: '#fff', fontWeight: '800' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timer: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusRow: { paddingHorizontal: 14, paddingBottom: 4 },
  statusChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontWeight: '800', letterSpacing: 0.6 },
  items: { paddingHorizontal: 14, paddingTop: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  itemBody: { flex: 1, minWidth: 0, gap: 4 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foodDot: { borderWidth: 2, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontWeight: '700', flexShrink: 1 },
  sub: { fontWeight: '500' },
  noteBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  noteText: { fontWeight: '700' },
  itemAction: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 12 },
  backBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  primary: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
})
