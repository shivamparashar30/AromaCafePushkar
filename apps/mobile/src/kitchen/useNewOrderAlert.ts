import { useCallback, useEffect, useRef } from 'react'
import { Vibration } from 'react-native'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import type { Order } from '../lib/types'

const CHIME = require('../../assets/sounds/new-order.wav')

/**
 * Chime + vibrate when a KOT the screen has not seen before arrives.
 *
 * The first load is silent: opening the app onto a board of twelve existing tickets is not
 * twelve new orders. After that, any order id not seen before counts, which also covers a
 * table's add-on round (it is a new KOT with its own id).
 *
 * Returns a function to feed every fresh order list into; it reports the KOTs that were new.
 */
export function useNewOrderAlert(muted: boolean) {
  const player = useAudioPlayer(CHIME)
  const seen = useRef<Set<string> | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    // A kitchen tablet is often left on silent; an order chime that the ringer switch can
    // swallow is not an order chime.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  return useCallback((orders: Order[]): Order[] => {
    const ids = new Set(orders.map((o) => o.id))
    if (seen.current === null) {
      seen.current = ids
      return []
    }
    const fresh = orders.filter((o) => !seen.current!.has(o.id) && o.status === 'placed')
    // Replacing (not adding to) the set keeps it bounded to what is on the board now.
    seen.current = ids

    if (fresh.length > 0 && !mutedRef.current) {
      Vibration.vibrate([0, 300, 150, 300])
      try {
        player.seekTo(0)
        player.play()
      } catch {
        // Vibration already fired; a failed chime must not take the board down.
      }
    }
    return fresh
  }, [player])
}
