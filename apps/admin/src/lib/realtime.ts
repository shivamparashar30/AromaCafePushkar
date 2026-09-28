import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
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

  useEffect(() => {
    const channel = supabase
      .channel(`${table}-${filter ?? 'all'}-${queryKeys.map((k) => k.join(':')).join(',')}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => {
          for (const key of queryKeys) {
            queryClient.invalidateQueries({ queryKey: key as unknown[] })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, queryClient])
}
