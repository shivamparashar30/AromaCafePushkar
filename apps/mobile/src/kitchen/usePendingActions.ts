import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { markItemsCooking, markItemsReady } from '../lib/api'
import type { Order } from '../lib/types'

export type Target = 'cooking' | 'ready'

interface Batch {
  id: number
  label: string
  itemIds: string[]
  target: Target
  /** Undo window closed; on its way to the server. */
  sending?: boolean
}

/** How long a tap can be taken back before it is sent to the server. */
export const UNDO_WINDOW_MS = 5000

/**
 * Status changes are held on the device for a few seconds before being sent, so a mis-tap
 * can be undone.
 *
 * Why hold instead of send-then-revert: the server will not let the kitchen move an item
 * back to 'ordered', and by the time a 'ready' is reverted the waiter has already been
 * notified that the food is up. Holding means an undone tap never reaches anyone.
 *
 * While held, the change is shown as if it had happened (see `overlay`).
 */
export function usePendingActions(onCommitted: () => Promise<void>) {
  const [batches, setBatches] = useState<Batch[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const nextId = useRef(1)
  // Latest batches for the unmount flush, which cannot read state.
  const batchesRef = useRef<Batch[]>([])
  batchesRef.current = batches
  const onCommittedRef = useRef(onCommitted)
  onCommittedRef.current = onCommitted

  const send = useCallback(async (batch: Batch) => {
    try {
      if (batch.target === 'cooking') await markItemsCooking(batch.itemIds)
      else await markItemsReady(batch.itemIds)
      await onCommittedRef.current()
    } catch (err: any) {
      Alert.alert('Could not update', err?.message || 'The change was not saved. Please try again.')
    } finally {
      // Dropped only after the reload, so the item does not flicker back to its old state
      // between the server accepting the change and the board hearing about it.
      setBatches((prev) => prev.filter((b) => b.id !== batch.id))
    }
  }, [])

  const commit = useCallback((batchId: number) => {
    const t = timers.current.get(batchId)
    if (t) clearTimeout(t)
    timers.current.delete(batchId)
    const batch = batchesRef.current.find((b) => b.id === batchId)
    if (!batch) return
    setBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, sending: true } : b)))
    void send(batch)
  }, [send])

  const queue = useCallback((label: string, itemIds: string[], target: Target) => {
    if (itemIds.length === 0) return
    const batch: Batch = { id: nextId.current++, label, itemIds, target }
    setBatches((prev) => [...prev, batch])
    timers.current.set(batch.id, setTimeout(() => commit(batch.id), UNDO_WINDOW_MS))
  }, [commit])

  const undo = useCallback((batchId: number) => {
    const t = timers.current.get(batchId)
    if (!t) return // already sending — too late to take back
    clearTimeout(t)
    timers.current.delete(batchId)
    setBatches((prev) => prev.filter((b) => b.id !== batchId))
  }, [])

  /**
   * Takes one item out of a held change (e.g. "All ready" on three dishes when only one
   * was a mistake). The rest of the batch still goes out on schedule.
   */
  const dropItem = useCallback((itemId: string) => {
    const batch = batchesRef.current.find((b) => !b.sending && b.itemIds.includes(itemId))
    if (!batch) return false
    const remaining = batch.itemIds.filter((id) => id !== itemId)
    if (remaining.length === 0) {
      undo(batch.id)
    } else {
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? { ...b, itemIds: remaining } : b)))
    }
    return true
  }, [undo])

  /** True while an item's change is still held on the device (undo window open). */
  const isHeld = useCallback(
    (itemId: string) => batchesRef.current.some((b) => !b.sending && b.itemIds.includes(itemId)),
    [],
  )

  // Leaving the screen sends whatever is still held rather than silently dropping taps.
  useEffect(() => () => {
    for (const [id, t] of timers.current) {
      clearTimeout(t)
      const batch = batchesRef.current.find((b) => b.id === id)
      if (batch) void send(batch)
    }
    timers.current.clear()
  }, [send])

  const pendingStatus = useMemo(() => {
    const m = new Map<string, Target>()
    for (const b of batches) for (const id of b.itemIds) m.set(id, b.target)
    return m
  }, [batches])

  /** Orders as they will be once the held changes land. */
  const overlay = useCallback((orders: Order[]): Order[] => {
    if (pendingStatus.size === 0) return orders
    return orders.map((o) => ({
      ...o,
      items: o.items.map((i) => {
        const target = pendingStatus.get(i.id)
        // A held change never resurrects an item cancelled in the meantime.
        return target && (i.status === 'ordered' || i.status === 'cooking') ? { ...i, status: target } : i
      }),
    }))
  }, [pendingStatus])

  /** The most recent change that can still be undone, for the undo bar. */
  const latest = batches.filter((b) => !b.sending).at(-1) ?? null

  return { queue, undo, dropItem, isHeld, overlay, latest }
}
