import { supabase } from '@/lib/supabase'

export interface Customer {
  id: string
  name: string | null
  phone: string
  whatsapp_opt_in: boolean
  visits: number
  total_spend: number
  created_at: string
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, whatsapp_opt_in, visits, total_spend, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export interface CustomerInput {
  name: string
  phone: string
  whatsapp_opt_in?: boolean
}

export async function createCustomer(input: CustomerInput) {
  const { data: outlet } = await supabase.from('profiles').select('outlet_id').single()
  if (!outlet) throw new Error('No profile found for current user')

  const { error } = await supabase.from('customers').insert({
    outlet_id: outlet.outlet_id,
    name: input.name,
    phone: input.phone,
    whatsapp_opt_in: input.whatsapp_opt_in ?? false,
  })
  if (error) throw error
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const { error } = await supabase.from('customers').update(input).eq('id', id)
  if (error) throw error
}
