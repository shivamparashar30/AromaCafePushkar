import { supabase } from '@/lib/supabase'
import { getMyOutletId } from '@/lib/outlet'
import type { Database } from '@/lib/database.types'

export type BookingStatus = Database['public']['Enums']['booking_status']
export type BookingSource = Database['public']['Enums']['booking_source']

export interface Booking {
  id: string
  name: string
  phone: string
  party_size: number
  starts_at: string
  status: BookingStatus
  source: BookingSource
  notes: string | null
  table_ids: string[]
  customer_id: string | null
  created_at: string
}

export interface BookingFilters {
  from?: string
  to?: string
  status?: BookingStatus | 'all'
}

export async function fetchBookings(filters: BookingFilters): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('id, name, phone, party_size, starts_at, status, source, notes, table_ids, customer_id, created_at')
    .order('starts_at', { ascending: false })

  if (filters.from) query = query.gte('starts_at', filters.from)
  if (filters.to) query = query.lte('starts_at', filters.to)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export interface BookingInput {
  name: string
  phone: string
  party_size: number
  starts_at: string
  source: BookingSource
  notes?: string
  table_ids?: string[]
}

export async function createBooking(input: BookingInput) {
  const outletId = await getMyOutletId()

  const { error } = await supabase.from('bookings').insert({
    outlet_id: outletId,
    name: input.name,
    phone: input.phone,
    party_size: input.party_size,
    starts_at: input.starts_at,
    source: input.source,
    notes: input.notes ?? null,
    table_ids: input.table_ids ?? [],
  })
  if (error) throw error
}

export async function updateBookingStatus(id: string, status: BookingStatus) {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) throw error
}
