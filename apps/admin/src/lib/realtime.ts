import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Subscribes to Postgres Changes on `table` (optionally filtered, e.g. `outlet_id=eq.<id>`) and
 * invalidates the given TanStack Query keys whenever a row changes, so screens stay live without
 * each one hand-rolling its own subscription/refetch logic.
 */
export function useRealtimeInvalidate(
  table: string,
  queryKeys: readonly (readonly unknown[])[],
  filter?: string,
) {
  const queryClient = useQueryClient()

  // Keep queryKeys in a ref so the subscription callback always uses the latest keys
  // without needing to re-subscribe on every key change.
  const keysRef = useRef(queryKeys)
  keysRef.current = queryKeys

  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${filter ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => {
          for (const key of keysRef.current) {
            queryClient.invalidateQueries({ queryKey: key as unknown[] })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, queryClient])
}
