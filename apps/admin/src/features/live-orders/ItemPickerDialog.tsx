import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchCategories, fetchItemDetail, fetchMenuItems } from '@/features/menu/api'
import { formatMoney } from '@/lib/money'
import type { PlaceOrderItem } from './api'

interface DraftLine {
  key: string
  item_id: string
  item_name: string
  variant_id?: string
  variant_name?: string
  unit_price: number
  qty: number
  addon_ids: string[]
  addon_label: string
}

export function ItemPickerDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (items: PlaceOrderItem[]) => Promise<void>
}) {
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: items = [] } = useQuery({ queryKey: ['menu-items'], queryFn: fetchMenuItems })
  const [categoryId, setCategoryId] = useState<string>('all')
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pickerItemId, setPickerItemId] = useState<string | null>(null)

  const visibleItems = items.filter(
    (i) => i.is_active && i.in_stock && (categoryId === 'all' || i.category_id === categoryId),
  )

  function addLine(line: DraftLine) {
    setDraft((prev) => [...prev, line])
  }

  function removeLine(key: string) {
    setDraft((prev) => prev.filter((l) => l.key !== key))
  }

  async function handleConfirm() {
    if (draft.length === 0) return
    setSubmitting(true)
    try {
      await onConfirm(
        draft.map((l) => ({
          item_id: l.item_id,
          variant_id: l.variant_id,
          qty: l.qty,
          addon_ids: l.addon_ids.length ? l.addon_ids : undefined,
        })),
      )
      setDraft([])
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const total = draft.reduce((s, l) => s + l.unit_price * l.qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-hidden sm:w-full">
        <DialogHeader>
          <DialogTitle>Add items</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-hidden md:grid md:grid-cols-3 md:gap-4">
          {/* Menu items */}
          <div className="flex flex-col overflow-hidden md:col-span-2">
            <Tabs value={categoryId} onValueChange={setCategoryId}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                {categories.map((c) => (
                  <TabsTrigger key={c.id} value={c.id}>
                    {c.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="mt-2 grid max-h-[35vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:max-h-[50vh]">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPickerItemId(item.id)}
                  className="rounded-md border p-2 text-left text-sm hover:bg-muted"
                >
                  <p className="font-medium text-xs sm:text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{formatMoney(item.price)}</p>
                </button>
              ))}
            </div>
          </div>
          {/* Cart */}
          <div className="flex flex-col overflow-hidden border-t pt-3 md:border-t-0 md:border-l md:pl-4 md:pt-0">
            <p className="mb-2 text-sm font-medium">Order ({draft.length})</p>
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[25vh] md:max-h-none">
              {draft.map((l) => (
                <div key={l.key} className="rounded border p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {l.item_name}
                        {l.variant_name ? ` (${l.variant_name})` : ''}
                      </p>
                      {l.addon_label && <p className="text-muted-foreground">{l.addon_label}</p>}
                      <p className="text-muted-foreground">
                        Qty {l.qty} · {formatMoney(l.unit_price * l.qty)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-destructive" onClick={() => removeLine(l.key)}>
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              {draft.length === 0 && <p className="text-xs text-muted-foreground">No items yet.</p>}
            </div>
            <div className="mt-2 border-t pt-2 text-sm font-medium">Total {formatMoney(total)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={handleConfirm} disabled={submitting || draft.length === 0}>
            {submitting ? 'Placing…' : `Place order (${draft.length})`}
          </Button>
        </DialogFooter>

        {pickerItemId && (
          <ItemOptionPicker
            itemId={pickerItemId}
            itemName={items.find((i) => i.id === pickerItemId)?.name ?? ''}
            basePrice={items.find((i) => i.id === pickerItemId)?.price ?? 0}
            onClose={() => setPickerItemId(null)}
            onAdd={(line) => {
              addLine(line)
              setPickerItemId(null)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ItemOptionPicker({
  itemId,
  itemName,
  basePrice,
  onClose,
  onAdd,
}: {
  itemId: string
  itemName: string
  basePrice: number
  onClose: () => void
  onAdd: (line: DraftLine) => void
}) {
  const { data } = useQuery({ queryKey: ['item-detail', itemId], queryFn: () => fetchItemDetail(itemId) })
  const [variantId, setVariantId] = useState<string | undefined>(undefined)
  const [addonIds, setAddonIds] = useState<string[]>([])
  const [qty, setQty] = useState(1)

  const variants = data?.variants ?? []
  const addonGroups = data?.addonGroups ?? []
  const selectedVariant = variants.find((v) => v.id === variantId)
  const unitPrice =
    (selectedVariant?.price ?? basePrice) +
    addonGroups
      .flatMap((g) => g.addons)
      .filter((a) => addonIds.includes(a.id))
      .reduce((s, a) => s + a.price, 0)

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function confirm() {
    const addonNames = addonGroups
      .flatMap((g) => g.addons)
      .filter((a) => addonIds.includes(a.id))
      .map((a) => a.name)
    onAdd({
      key: crypto.randomUUID(),
      item_id: itemId,
      item_name: itemName,
      variant_id: variantId,
      variant_name: selectedVariant?.name,
      unit_price: unitPrice,
      qty,
      addon_ids: addonIds,
      addon_label: addonNames.join(', '),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-md sm:w-full">
        <DialogHeader>
          <DialogTitle>{itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {variants.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Variant</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${variantId === v.id ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {v.name} · {formatMoney(v.price)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {addonGroups.map((g) => (
            <div key={g.id} className="space-y-1">
              <p className="text-sm font-medium">
                {g.name} {g.max_select > 0 && <span className="text-xs text-muted-foreground">(max {g.max_select})</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.addons.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleAddon(a.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${addonIds.includes(a.id) ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {a.name} · +{formatMoney(a.price)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Quantity</p>
            <Input
              type="number"
              min={1}
              className="w-20"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={confirm}>Add · {formatMoney(unitPrice * qty)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
