import type { Order, OrderItem } from '../lib/types'

/** Which board column a ticket belongs in. Derived, never stored. */
export type Stage = 'new' | 'cooking' | 'ready'

export type TimerLevel = 'ok' | 'warn' | 'late'

/** Item statuses that are finished business and no longer belong on a ticket's work list. */
const DONE_STATUSES = new Set(['served', 'cancelled', 'wasted'])

/** Fallback when a ticket's dishes carry no prep time (matches the menu_items default). */
const DEFAULT_PREP_MINUTES = 15

/**
 * Words in an item note that mean "get this wrong and someone gets ill or upset", as
 * opposed to "extra crispy". These get a warning badge, not just the amber note box.
 */
const ALERT_NOTE = /allerg|jain|no onion|no garlic|nut|peanut|gluten|vegan|dairy|lactose|egg|shellfish|satvik/i

export function isLive(item: OrderItem): boolean {
  return !DONE_STATUSES.has(item.status)
}

export function noteNeedsAlert(note: string | null | undefined): boolean {
  return !!note && ALERT_NOTE.test(note)
}

/**
 * Board column from the items still being worked on. Everything not started is New,
 * everything finished is Ready, and any mix in between is Cooking: a half-started ticket
 * is the cook's current job, not a new one.
 */
export function stageOf(items: OrderItem[]): Stage | null {
  const live = items.filter(isLive)
  if (live.length === 0) return null
  if (live.every((i) => i.status === 'ready')) return 'ready'
  if (live.every((i) => i.status === 'ordered')) return 'new'
  return 'cooking'
}

/**
 * The ticket is due when its slowest dish should be done, so a chai and a biryani on one
 * KOT are timed by the biryani.
 */
export function targetMinutes(items: OrderItem[]): number {
  const preps = items.filter(isLive).map((i) => i.prep_minutes ?? DEFAULT_PREP_MINUTES)
  return preps.length ? Math.max(...preps) : DEFAULT_PREP_MINUTES
}

/** Green until 70% of the target, amber until the target, red after. */
export function timerLevel(elapsedMin: number, target: number): TimerLevel {
  if (elapsedMin >= target) return 'late'
  if (elapsedMin >= target * 0.7) return 'warn'
  return 'ok'
}

export function elapsedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

/** "1st", "2nd", "3rd"… for the add-on round label. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * A station-filtered view of an order. Items without a station are kept on every station's
 * screen: an unassigned dish shown twice is a nuisance, an unassigned dish shown nowhere is
 * a table that never gets its food.
 */
export function filterByStation(order: Order, station: string | null): Order {
  if (!station) return order
  return { ...order, items: order.items.filter((i) => !i.station || i.station === station) }
}

export interface TotalsRow {
  key: string
  name: string
  variant: string | null
  toStart: number
  cooking: number
}

/** "All day" counts: how many of each dish are still to make across every open ticket. */
export function itemTotals(orders: Order[]): TotalsRow[] {
  const rows = new Map<string, TotalsRow>()
  for (const o of orders) {
    for (const i of o.items) {
      if (i.status !== 'ordered' && i.status !== 'cooking') continue
      const key = `${i.menu_item_name}|${i.variant_name ?? ''}`
      const row = rows.get(key) ?? { key, name: i.menu_item_name, variant: i.variant_name, toStart: 0, cooking: 0 }
      if (i.status === 'ordered') row.toStart += i.qty
      else row.cooking += i.qty
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.toStart + b.cooking - (a.toStart + a.cooking))
}
