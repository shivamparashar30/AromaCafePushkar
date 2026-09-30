import { supabase } from '@/lib/supabase'
import { getMyOutletId } from '@/lib/outlet'
import type { Database } from '@/lib/database.types'

export type FoodType = Database['public']['Enums']['food_type']

export interface Category {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface Variant {
  id?: string
  name: string
  price: number
}

export interface AddonGroupInput {
  id?: string
  name: string
  min_select: number
  max_select: number
  addons: { id?: string; name: string; price: number }[]
}

export interface MenuItem {
  id: string
  category_id: string
  tax_group_id: string | null
  name: string
  description: string | null
  price: number
  food_type: FoodType
  station: string | null
  prep_minutes: number
  tags: string[]
  in_stock: boolean
  is_active: boolean
  image_urls: string[]
}

export interface TaxGroup {
  id: string
  name: string
}

async function currentOutletId(): Promise<string> {
  return getMyOutletId()
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_active')
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function fetchTaxGroups(): Promise<TaxGroup[]> {
  const { data, error } = await supabase.from('tax_groups').select('id, name').order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(
      'id, category_id, tax_group_id, name, description, price, food_type, station, prep_minutes, tags, in_stock, is_active, image_urls',
    )
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function fetchItemDetail(itemId: string) {
  const [{ data: variants, error: vErr }, { data: groups, error: gErr }] = await Promise.all([
    supabase.from('item_variants').select('id, name, price').eq('item_id', itemId).order('sort_order'),
    supabase
      .from('addon_groups')
      .select('id, name, min_select, max_select, addons(id, name, price)')
      .eq('item_id', itemId)
      .order('sort_order'),
  ])
  if (vErr) throw vErr
  if (gErr) throw gErr
  return { variants: variants ?? [], addonGroups: groups ?? [] }
}

export async function createCategory(name: string) {
  const outlet_id = await currentOutletId()
  const { data: maxSort } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase
    .from('categories')
    .insert({ outlet_id, name, sort_order: (maxSort?.sort_order ?? 0) + 1 })
  if (error) throw error
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'is_active'>>) {
  const { error } = await supabase.from('categories').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export interface MenuItemInput {
  category_id: string
  tax_group_id: string | null
  name: string
  description: string
  price: number
  food_type: FoodType
  station: string
  prep_minutes: number
  tags: string[]
  variants: Variant[]
  addonGroups: AddonGroupInput[]
}

export async function createMenuItem(input: MenuItemInput) {
  const outlet_id = await currentOutletId()
  const { data: item, error } = await supabase
    .from('menu_items')
    .insert({
      outlet_id,
      category_id: input.category_id,
      tax_group_id: input.tax_group_id,
      name: input.name,
      description: input.description || null,
      price: input.price,
      food_type: input.food_type,
      station: input.station || null,
      prep_minutes: input.prep_minutes,
      tags: input.tags,
    })
    .select('id')
    .single()
  if (error) throw error

  await saveVariantsAndAddons(item.id, input.variants, input.addonGroups)
}

export async function updateMenuItem(id: string, input: MenuItemInput) {
  const { error } = await supabase
    .from('menu_items')
    .update({
      category_id: input.category_id,
      tax_group_id: input.tax_group_id,
      name: input.name,
      description: input.description || null,
      price: input.price,
      food_type: input.food_type,
      station: input.station || null,
      prep_minutes: input.prep_minutes,
      tags: input.tags,
    })
    .eq('id', id)
  if (error) throw error

  // Replace variants/addon groups wholesale -- simplest correct approach for a small admin form.
  await supabase.from('item_variants').delete().eq('item_id', id)
  const { data: oldGroups } = await supabase.from('addon_groups').select('id').eq('item_id', id)
  if (oldGroups?.length) {
    await supabase.from('addon_groups').delete().in(
      'id',
      oldGroups.map((g) => g.id),
    )
  }
  await saveVariantsAndAddons(id, input.variants, input.addonGroups)
}

async function saveVariantsAndAddons(itemId: string, variants: Variant[], addonGroups: AddonGroupInput[]) {
  if (variants.length > 0) {
    const { error } = await supabase.from('item_variants').insert(
      variants.map((v, i) => ({ item_id: itemId, name: v.name, price: v.price, sort_order: i })),
    )
    if (error) throw error
  }

  for (const [i, group] of addonGroups.entries()) {
    const { data: newGroup, error: gErr } = await supabase
      .from('addon_groups')
      .insert({
        item_id: itemId,
        name: group.name,
        min_select: group.min_select,
        max_select: group.max_select,
        sort_order: i,
      })
      .select('id')
      .single()
    if (gErr) throw gErr

    if (group.addons.length > 0) {
      const { error: aErr } = await supabase.from('addons').insert(
        group.addons.map((a) => ({ group_id: newGroup.id, name: a.name, price: a.price })),
      )
      if (aErr) throw aErr
    }
  }
}

export async function deleteMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id)
  if (error) throw error
}

export async function toggleInStock(id: string, in_stock: boolean) {
  const { error } = await supabase.from('menu_items').update({ in_stock }).eq('id', id)
  if (error) throw error
}

export async function bulkSetInStock(ids: string[], in_stock: boolean) {
  const { error } = await supabase.from('menu_items').update({ in_stock }).in('id', ids)
  if (error) throw error
}

export async function bulkPriceChangePercent(ids: string[], percent: number) {
  // Percent change needs a per-row read-modify-write since Postgres can't do `price * x` through
  // the REST update filter API in one call.
  const { data: rows, error } = await supabase.from('menu_items').select('id, price').in('id', ids)
  if (error) throw error
  await Promise.all(
    (rows ?? []).map((r) =>
      supabase
        .from('menu_items')
        .update({ price: Math.round(r.price * (1 + percent / 100)) })
        .eq('id', r.id),
    ),
  )
}
