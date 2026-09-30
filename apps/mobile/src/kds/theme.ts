import type { KdsSettings } from './settings'

/**
 * Screen classes for the kitchen display. The board is read from 2–3 metres away on a
 * wall-mounted TV and from arm's length on a phone, so the layout changes shape at each
 * step rather than just scaling down.
 */
export type ScreenClass = 'phone' | 'smallTablet' | 'largeTablet' | 'tv'

export function screenClassFor(width: number): ScreenClass {
  if (width < 600) return 'phone'
  if (width < 900) return 'smallTablet'
  if (width < 1400) return 'largeTablet'
  return 'tv'
}

/** Cards visible per column before the column scrolls. */
export const CARDS_PER_COLUMN: Record<ScreenClass, number> = {
  phone: 1,
  smallTablet: 2,
  largeTablet: 4,
  tv: 6,
}

/**
 * Four columns need real width. Below this a tablet in portrait shows the three working
 * columns and moves Served behind the History tab, rather than squeezing four columns
 * into strips too narrow to read.
 */
export const FOUR_COLUMN_MIN_WIDTH = 1000

/**
 * Base type scale per screen class, multiplied by the manager's fontScale.
 * Sizes follow the brief: KOT/table 24–40, item names 18–28, notes 16–22.
 */
const TYPE_SCALE: Record<ScreenClass, { kot: number; item: number; note: number; meta: number; timer: number }> = {
  phone:        { kot: 24, item: 18, note: 16, meta: 13, timer: 20 },
  smallTablet:  { kot: 28, item: 21, note: 17, meta: 14, timer: 23 },
  largeTablet:  { kot: 34, item: 24, note: 19, meta: 15, timer: 27 },
  tv:           { kot: 40, item: 28, note: 22, meta: 17, timer: 32 },
}

export function typeScale(screen: ScreenClass, fontScale: number) {
  const base = TYPE_SCALE[screen]
  const f = (n: number) => Math.round(n * fontScale)
  return {
    kot: f(base.kot),
    item: f(base.item),
    note: f(base.note),
    meta: f(base.meta),
    timer: f(base.timer),
  }
}

/**
 * Minimum touch target. The brief asks for 56px on tablets and larger on TVs; wet or
 * gloved hands are the reason, so these are floors, not targets.
 */
export function touchSize(screen: ScreenClass) {
  return screen === 'phone' ? 52 : screen === 'tv' ? 76 : 60
}

export interface KdsTheme {
  bg: string
  card: string
  cardRaised: string
  text: string
  textDim: string
  border: string
  accent: string
  accentSoft: string
  noteBg: string
  noteText: string
  warn: string
  urgent: string
  danger: string
  stageNew: string
  stageReady: string
  overlay: string
}

/**
 * One accent colour, grey neutrals, and two alert colours reserved for ageing.
 *
 * The first cut used a different colour per stage (blue / orange / green) on top of the
 * amber and red age warnings. On a full board that is five competing colours and nothing
 * stands out, which is the opposite of what a chef needs. Stage is already obvious from
 * which column a card sits in, so colour is spent only where it carries information the
 * layout cannot: how late a ticket is.
 */
const LIGHT: KdsTheme = {
  bg: '#F7F7F8',
  card: '#FFFFFF',
  cardRaised: '#F2F3F5',
  text: '#16181D',
  textDim: '#7A828F',
  border: '#E6E8EC',
  accent: '#E8713A',
  accentSoft: '#FFF2EA',
  noteBg: '#FFF4E0',
  noteText: '#9A5B00',
  warn: '#D98324',
  urgent: '#D93838',
  danger: '#D93838',
  stageNew: '#5B6474',
  stageReady: '#1E9E54',
  overlay: 'rgba(16,18,22,0.45)',
}

const DARK: KdsTheme = {
  bg: '#101216',
  card: '#1B1E24',
  cardRaised: '#242830',
  text: '#F4F6F8',
  textDim: '#8C94A2',
  border: '#2B303A',
  accent: '#E8713A',
  accentSoft: '#3A2216',
  noteBg: '#4A3207',
  noteText: '#FFD166',
  warn: '#E8A33D',
  urgent: '#EF4444',
  danger: '#EF4444',
  stageNew: '#9AA3B2',
  stageReady: '#2FBF6A',
  overlay: 'rgba(0,0,0,0.65)',
}

export function themeFor(settings: KdsSettings): KdsTheme {
  return settings.theme === 'dark' ? DARK : LIGHT
}

/**
 * The four states a chef thinks in. 'served' is a real column, not a disappearance:
 * staff need to see what just went out, and to pull one back if it was marked by mistake.
 * 'wasted' is terminal and never appears as a column.
 */
export type Stage = 'new' | 'preparing' | 'ready' | 'served'

export const STAGES: {
  key: Stage
  label: string
  itemStatus: 'ordered' | 'cooking' | 'ready' | 'served'
  /** Status is never carried by colour alone. */
  icon: 'ellipse-outline' | 'flame' | 'checkmark-circle' | 'arrow-forward-circle'
}[] = [
  { key: 'new', label: 'New', itemStatus: 'ordered', icon: 'ellipse-outline' },
  { key: 'preparing', label: 'Preparing', itemStatus: 'cooking', icon: 'flame' },
  { key: 'ready', label: 'Ready', itemStatus: 'ready', icon: 'checkmark-circle' },
  { key: 'served', label: 'Served', itemStatus: 'served', icon: 'arrow-forward-circle' },
]

/** Stage immediately before this one, for the back action. Null on the first column. */
export function previousStage(stage: Stage): Stage | null {
  const i = STAGES.findIndex((s) => s.key === stage)
  return i > 0 ? STAGES[i - 1].key : null
}

/**
 * A ticket's stage is the LEAST advanced of its live items: a KOT with one item still
 * waiting is not "preparing", or the chef would think that item was already handled.
 */
export function stageOfOrder(items: { status: string }[]): Stage {
  const live = items.filter((i) => i.status !== 'cancelled' && i.status !== 'wasted')
  if (live.length === 0) return 'served'
  if (live.some((i) => i.status === 'ordered')) return 'new'
  if (live.some((i) => i.status === 'cooking')) return 'preparing'
  if (live.some((i) => i.status === 'ready')) return 'ready'
  return 'served'
}

/** Per-stage accent, used for the column header and the card's status chip. */
export function stageColor(stage: Stage, theme: KdsTheme): string {
  if (stage === 'new') return theme.stageNew
  if (stage === 'preparing') return theme.accent
  if (stage === 'ready') return theme.stageReady
  return theme.textDim
}

export type Age = 'normal' | 'warn' | 'urgent'

export function ageOf(createdAt: string, settings: KdsSettings): Age {
  const mins = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (mins >= settings.urgentAfterMinutes) return 'urgent'
  if (mins >= settings.warnAfterMinutes) return 'warn'
  return 'normal'
}

export function minutesSince(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
}

/** mm:ss while under an hour, then h:mm — a chef reads elapsed time, not a clock. */
export function elapsedLabel(createdAt: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
