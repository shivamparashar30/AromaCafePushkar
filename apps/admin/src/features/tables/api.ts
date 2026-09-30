import { supabase } from '@/lib/supabase'
import { getMyOutletId } from '@/lib/outlet'
import type { Database } from '@/lib/database.types'

export type TableStatus = Database['public']['Enums']['table_status']

export interface FloorWithTables {
  id: string
  name: string
  sort_order: number
  /** Owned by the system (the Counter area), not by the user. */
  is_system: boolean
  tables: {
    id: string
    name: string
    capacity: number
    status: TableStatus
    is_active: boolean
    qr_token: string
    is_counter: boolean
    deleted_at: string | null
  }[]
}

/**
 * Counter slots are an implementation detail of counter billing: create_walkin_bill
 * provisions and reuses them, and a counter bill is raised and settled entirely from the
 * Bills page. They are not tables, so neither table view lists them and the Counter floor
 * disappears with them. `includeCounter` exists for anything that genuinely needs the
 * plumbing; nothing in the UI passes it today.
 */
/**
 * Cache key prefix for every floors-with-tables query. Invalidating this covers all
 * option variants at once.
 */
export const FLOORS_QUERY_KEY = ['floors-with-tables'] as const

/**
 * Query descriptor for the floor list. Options are folded into the cache key here rather
 * than at each call site: three pages previously declared their own
 * `['floors-with-tables']` key while passing different options, so whichever loaded last
 * overwrote the others' data and counter slots kept surfacing where they shouldn't.
 */
export function floorsQuery(options: { includeCounter?: boolean; onlyActive?: boolean } = {}) {
  return {
    queryKey: [...FLOORS_QUERY_KEY, options] as const,
    queryFn: () => fetchFloors(options),
  }
}

export async function fetchFloors(
  { includeCounter = false, onlyActive = false }: {
    includeCounter?: boolean
    /** Live ordering hides deactivated tables; table structure keeps them visible so
     *  they can be switched back on. */
    onlyActive?: boolean
  } = {},
): Promise<FloorWithTables[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('id, name, sort_order, is_system, tables(id, name, capacity, status, is_active, qr_token, is_counter, deleted_at)')
    .is('deleted_at', null)
    .order('sort_order')

  if (error) throw error

  return (data ?? [])
    .map((f) => ({
      ...f,
      tables: [...f.tables]
        // Retired tables keep their row so historical bills still resolve their name.
        .filter((t) => t.deleted_at === null)
        .filter((t) => !onlyActive || t.is_active)
        .filter((t) => includeCounter || !t.is_counter)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }))
    // System floors (the Counter area) are created and owned by create_walkin_bill --
    // never listed, renamed or deleted by hand.
    .filter((f) => includeCounter || !f.is_system)
    // A floor with nothing visible left in it is noise, not information. Table structure
    // keeps empty floors so they can be filled or deleted; live ordering drops them.
    .filter((f) => !onlyActive || f.tables.length > 0)
}

export async function createFloor(name: string) {
  const outletId = await getMyOutletId()

  const { data: maxSort } = await supabase
    .from('floors')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('floors').insert({
    outlet_id: outletId,
    name,
    sort_order: (maxSort?.sort_order ?? 0) + 1,
  })
  if (error) throw error
}

export async function renameFloor(id: string, name: string) {
  const { error } = await supabase.from('floors').update({ name }).eq('id', id)
  if (error) throw error
}

/**
 * Retires the floor. Refused server-side until every table on it is retired first,
 * and the row is kept so past bills can still resolve which floor a table was on.
 */
export async function deleteFloor(id: string) {
  const { error } = await supabase.rpc('delete_floor', { p_floor_id: id })
  if (error) throw error
}

export interface TableInput {
  name: string
  floor_id: string
  capacity: number
}

export async function createTable(input: TableInput) {
  const outletId = await getMyOutletId()

  const { error } = await supabase.from('tables').insert({
    outlet_id: outletId,
    floor_id: input.floor_id,
    name: input.name,
    capacity: input.capacity,
    qr_token: crypto.randomUUID().replace(/-/g, ''),
  })
  if (error) throw error
}

export async function updateTable(id: string, input: Partial<TableInput & { is_active: boolean }>) {
  const { error } = await supabase.from('tables').update(input).eq('id', id)
  if (error) throw error
}

/**
 * Retires the table: it disappears everywhere it is used, but the row survives so
 * past bills keep showing which table and floor they came from. Hard deletion was
 * never possible - table_sessions.table_id is ON DELETE RESTRICT.
 */
export async function deleteTable(id: string) {
  const { error } = await supabase.rpc('delete_table', { p_table_id: id })
  if (error) throw error
}

export async function regenerateTableQr(id: string) {
  const { error } = await supabase
    .from('tables')
    .update({ qr_token: crypto.randomUUID().replace(/-/g, '') })
    .eq('id', id)
  if (error) throw error
}
