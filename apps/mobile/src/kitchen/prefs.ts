import { useCallback, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Per-device kitchen preferences. A tandoor tablet and a beverages phone in the same
 * kitchen want different stations, so these live on the device, not the profile.
 *
 * SecureStore is the only persistence already in the app (it backs the auth session).
 * These are not secrets; it just avoids a new dependency for a few bytes.
 */
export interface KitchenPrefs {
  muted: boolean
  /** null = every station. */
  station: string | null
}

const PREFS_KEY = 'kds_prefs_v1'
const DEFAULT_PREFS: KitchenPrefs = { muted: false, station: null }

export function useKitchenPrefs() {
  const [prefs, setPrefs] = useState<KitchenPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    SecureStore.getItemAsync(PREFS_KEY)
      // Merged over the defaults so prefs saved by an older build still load.
      .then((raw) => { if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }) })
      .catch(() => {})
  }, [])

  const update = useCallback((patch: Partial<KitchenPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  return { prefs, update }
}

// Tickets the kitchen has cleared off this screen by hand. Display-only: a ready order is
// still waiting on a waiter to serve it. Persisted so a reload of an always-on KDS does not
// bring every cleared ticket back.
const DISMISSED_KEY = 'kds_dismissed_orders'

async function persistDismissed(ids: string[]) {
  try {
    // SecureStore caps values at 2KB on Android; the list self-prunes on every load, so
    // this only guards a pathological burst.
    await SecureStore.setItemAsync(DISMISSED_KEY, JSON.stringify(ids.slice(-40)))
  } catch {
    // Display-only state — losing it just means cleared tickets reappear once.
  }
}

export function useDismissedTickets() {
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    SecureStore.getItemAsync(DISMISSED_KEY)
      .then((raw) => { if (raw) setDismissed(JSON.parse(raw)) })
      .catch(() => {})
  }, [])

  const change = useCallback((fn: (prev: string[]) => string[]) => {
    setDismissed((prev) => {
      const next = fn(prev)
      if (next !== prev) void persistDismissed(next)
      return next
    })
  }, [])

  const dismiss = useCallback((id: string) => change((prev) => [...prev, id]), [change])
  const restore = useCallback((id: string) => change((prev) => prev.filter((x) => x !== id)), [change])
  const restoreAll = useCallback(() => change(() => []), [change])

  /**
   * Self-pruning: once an order leaves the board for real (served, cancelled-and-expired,
   * or settled with the bill) its id is dropped, so the list cannot grow without bound.
   */
  const prune = useCallback((liveIds: Set<string>) => {
    change((prev) => {
      const next = prev.filter((id) => liveIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [change])

  return { dismissed, dismiss, restore, restoreAll, prune }
}
