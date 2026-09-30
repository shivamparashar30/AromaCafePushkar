import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Enum values read from the database rather than retyped as <SelectItem> lists.
 *
 * Hard-coding them meant a value added to an enum was silently missing from the UI —
 * the counter bill dialog offered 3 of the 5 payment modes for exactly this reason.
 */
export async function fetchEnumValues(enumName: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_enum_values', { p_enum: enumName })
  if (error) throw error
  return (data ?? []).map((r: { value: string }) => r.value)
}

/** `no_show` -> `No show`. Enum labels are snake_case by convention. */
export function humaniseEnum(value: string): string {
  const special: Record<string, string> = { upi: 'UPI' }
  if (special[value]) return special[value]
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function useEnumOptions(enumName: string) {
  const { data = [] } = useQuery({
    queryKey: ['enum', enumName],
    queryFn: () => fetchEnumValues(enumName),
    // Enum definitions change only with a migration.
    staleTime: Infinity,
  })
  return data.map((value) => ({ value, label: humaniseEnum(value) }))
}

/**
 * The outlet's public identity, readable before sign-in. Used where the restaurant name
 * is needed but no session exists yet (the login screen).
 */
export function useOutletName() {
  const { data } = useQuery({
    queryKey: ['public-outlet'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_outlet_info')
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
    staleTime: Infinity,
  })
  return data?.name ?? ''
}
