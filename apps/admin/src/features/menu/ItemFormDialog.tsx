import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { rupeesToPaise } from '@/lib/money'
import type { Category, MenuItem, MenuItemInput, TaxGroup } from './api'
import { fetchItemDetail } from './api'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string(),
  category_id: z.string().min(1, 'Required'),
  tax_group_id: z.string(),
  price: z.number().min(0),
  food_type: z.enum(['veg', 'non_veg', 'egg']),
  station: z.string(),
  prep_minutes: z.number().min(1),
  tags: z.string(),
  variants: z.array(z.object({ name: z.string().min(1), price: z.number().min(0) })),
  addonGroups: z.array(
    z.object({
      name: z.string().min(1),
      min_select: z.number().min(0),
      max_select: z.number().min(0),
      addons: z.array(z.object({ name: z.string().min(1), price: z.number().min(0) })),
    }),
  ),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  name: '',
  description: '',
  category_id: '',
  tax_group_id: '',
  price: 0,
  food_type: 'veg',
  station: '',
  prep_minutes: 15,
  tags: '',
  variants: [],
  addonGroups: [],
}

export function ItemFormDialog({
  open,
  onOpenChange,
  categories,
  taxGroups,
  editingItem,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  taxGroups: TaxGroup[]
  editingItem: MenuItem | null
  onSubmit: (input: MenuItemInput) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  const variantsArray = useFieldArray({ control, name: 'variants' })
  const addonGroupsArray = useFieldArray({ control, name: 'addonGroups' })

  useEffect(() => {
    if (!open) return
    if (!editingItem) {
      reset({ ...EMPTY, category_id: categories[0]?.id ?? '' })
      return
    }
    fetchItemDetail(editingItem.id).then(({ variants, addonGroups }) => {
      reset({
        name: editingItem.name,
        description: editingItem.description ?? '',
        category_id: editingItem.category_id,
        tax_group_id: editingItem.tax_group_id ?? '',
        price: editingItem.price / 100,
        food_type: editingItem.food_type,
        station: editingItem.station ?? '',
        prep_minutes: editingItem.prep_minutes,
        tags: editingItem.tags.join(', '),
        variants: variants.map((v) => ({ name: v.name, price: v.price / 100 })),
        addonGroups: addonGroups.map((g) => ({
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          addons: g.addons.map((a) => ({ name: a.name, price: a.price / 100 })),
        })),
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem])

  async function submit(values: FormValues) {
    setSubmitting(true)
    try {
      await onSubmit({
        category_id: values.category_id,
        tax_group_id: values.tax_group_id || null,
        name: values.name,
        description: values.description,
        price: rupeesToPaise(values.price),
        food_type: values.food_type,
        station: values.station,
        prep_minutes: values.prep_minutes,
        tags: values.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        variants: values.variants.map((v) => ({ name: v.name, price: rupeesToPaise(v.price) })),
        addonGroups: values.addonGroups.map((g) => ({
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          addons: g.addons.map((a) => ({ name: a.name, price: rupeesToPaise(a.price) })),
        })),
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const foodType = watch('food_type')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit item' : 'Add item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Name</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} {...register('description')} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={watch('category_id')} onValueChange={(v) => setValue('category_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax group</Label>
              <Select
                value={watch('tax_group_id') || '__none'}
                onValueChange={(v) => setValue('tax_group_id', v === '__none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {taxGroups.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base price (₹)</Label>
              <Input type="number" step="0.01" {...register('price', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">Ignored if variants are set below.</p>
            </div>
            <div className="space-y-2">
              <Label>Food type</Label>
              <Select value={foodType} onValueChange={(v) => setValue('food_type', v as FormValues['food_type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="veg">Veg</SelectItem>
                  <SelectItem value="non_veg">Non-veg</SelectItem>
                  <SelectItem value="egg">Egg</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kitchen station</Label>
              <Input placeholder="e.g. Tandoor" {...register('station')} />
            </div>
            <div className="space-y-2">
              <Label>Prep time (minutes)</Label>
              <Input type="number" {...register('prep_minutes', { valueAsNumber: true })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input placeholder="Bestseller, Chef's special" {...register('tags')} />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Variants (e.g. Half / Full)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => variantsArray.append({ name: '', price: 0 })}
              >
                Add variant
              </Button>
            </div>
            {variantsArray.fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input placeholder="Name" {...register(`variants.${i}.name` as const)} />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price ₹"
                  className="w-32"
                  {...register(`variants.${i}.price` as const, { valueAsNumber: true })}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => variantsArray.remove(i)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Add-on groups (e.g. Extras)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addonGroupsArray.append({ name: '', min_select: 0, max_select: 1, addons: [] })
                }
              >
                Add group
              </Button>
            </div>
            {addonGroupsArray.fields.map((group, gi) => (
              <AddonGroupRow key={group.id} control={control} register={register} groupIndex={gi} onRemove={() => addonGroupsArray.remove(gi)} />
            ))}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editingItem ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddonGroupRow({
  control,
  register,
  groupIndex,
  onRemove,
}: {
  control: ReturnType<typeof useForm<FormValues>>['control']
  register: ReturnType<typeof useForm<FormValues>>['register']
  groupIndex: number
  onRemove: () => void
}) {
  const addons = useFieldArray({ control, name: `addonGroups.${groupIndex}.addons` })

  return (
    <div className="space-y-2 rounded border p-2">
      <div className="flex items-center gap-2">
        <Input placeholder="Group name" {...register(`addonGroups.${groupIndex}.name` as const)} />
        <Input
          type="number"
          className="w-20"
          placeholder="Min"
          {...register(`addonGroups.${groupIndex}.min_select` as const, { valueAsNumber: true })}
        />
        <Input
          type="number"
          className="w-20"
          placeholder="Max"
          {...register(`addonGroups.${groupIndex}.max_select` as const, { valueAsNumber: true })}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove group
        </Button>
      </div>
      <div className="space-y-1.5 pl-4">
        {addons.fields.map((a, ai) => (
          <div key={a.id} className="flex items-center gap-2">
            <Input
              placeholder="Add-on name"
              {...register(`addonGroups.${groupIndex}.addons.${ai}.name` as const)}
            />
            <Input
              type="number"
              step="0.01"
              className="w-28"
              placeholder="Price ₹"
              {...register(`addonGroups.${groupIndex}.addons.${ai}.price` as const, { valueAsNumber: true })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => addons.remove(ai)}>
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => addons.append({ name: '', price: 0 })}
        >
          + Add-on
        </Button>
      </div>
    </div>
  )
}
