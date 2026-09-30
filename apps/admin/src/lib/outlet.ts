import { supabase } from './supabase'

/**
 * The signed-in user's outlet id.
 *
 * Do NOT write `from('profiles').select('outlet_id').single()`. Under RLS an admin or
 * manager can read *every* profile in the outlet (profiles_select_admin_manager), so
 * `.single()` sees many rows and fails with "JSON object requested, multiple (or no)
 * rows returned" — which is why Add table hung: the insert threw before it ran.
 * Scoping to the caller's own row is what makes it a single row.
 */
export async function getMyOutletId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You are signed out. Sign in again and retry.')

  const { data, error } = await supabase
    .from('profiles')
    .select('outlet_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('No staff profile found for the signed-in user.')
  return data.outlet_id
}
