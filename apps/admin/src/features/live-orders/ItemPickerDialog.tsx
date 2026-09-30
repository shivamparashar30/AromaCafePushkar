import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fetchCategories, fetchItemDetail, fetchMenuItems } from '@/features/menu/api'
import { formatMoney } from '@/lib/money'
import { fetchItemsWithOptions, type PlaceOrderItem } from './api'

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

/** Veg / non-veg / egg square, the convention Indian menus use. */
function FoodTypeDot({ type }: { type: string | null }) {
  const color =
    type === 'veg' ? 'border-green-600 bg-green-600'
    : type === 'egg' ? 'border-amber-500 bg-amber-500'
    : 'border-red-600 bg-red-600'
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-[2px] border-2 bg-clip-content p-[1px] ${color}`}
    />
  )
}

export function ItemPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Add items',
  confirmLabel = 'Place order',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (items: PlaceOrderItem[]) => Promise<void>
  /** The picker is shared by table orders and counter bills. */
  title?: string
  confirmLabel?: string
}) {
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: items = [] } = useQuery({ queryKey: ['menu-items'], queryFn: fetchMenuItems })
  const { data: itemsWithOptions } = useQuery({
    queryKey: ['items-with-options'],
    queryFn: fetchItemsWithOptions,
  })

  const [categoryId, setCategoryId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pickerItemId, setPickerItemId] = useState<string | null>(null)

  const available = useMemo(() => items.filter((i) => i.is_active && i.in_stock), [items])

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return available.filter((i) => {
      if (categoryId !== 'all' && i.category_id !== categoryId) return false
      if (!q) return true
      return i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
    })
  }, [available, categoryId, search])

  // Only offer categories that actually have something orderable in them.
  const usableCategories = useMemo(
    () => categories.filter((c) => available.some((i) => i.category_id === c.id)),
    [categories, available],
  )

  /** Identity of a draft line: same dish, same variant, same add-ons. */
  function lineSignature(l: DraftLine) {
    return `${l.item_id}|${l.variant_id ?? ''}|${[...l.addon_ids].sort().join(',')}`
  }

  function addLine(line: DraftLine) {
    setDraft((prev) => {
      // Adding the same thing twice bumps the quantity instead of stacking identical
      // rows, which is what produced "5x Masala Chai" as five separate lines.
      const sig = lineSignature(line)
      const at = prev.findIndex((l) => lineSignature(l) === sig)
      if (at === -1) return [...prev, line]
      return prev.map((l, i) => (i === at ? { ...l, qty: l.qty + line.qty } : l))
    })
  }

  function handleItemClick(itemId: string) {
    const item = available.find((i) => i.id === itemId)
    if (!item) return
    // Items with variants or add-ons need the options step; the rest go straight in.
    if (!itemsWithOptions || itemsWithOptions.has(itemId)) {
      setPickerItemId(itemId)
      return
    }
    addLine({
      key: crypto.randomUUID(),
      item_id: item.id,
      item_name: item.name,
      unit_price: item.price,
      qty: 1,
      addon_ids: [],
      addon_label: '',
    })
  }

  function changeQty(key: string, delta: number) {
    setDraft((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    )
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
  const totalQty = draft.reduce((s, l) => s + l.qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:h-[86dvh]">
        <DialogHeader className="border-b px-4 py-3 sm:px-5">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_19rem]">
          {/* ---- Menu ---- */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-3 sm:px-5">
              <Input
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Categories: one scrolling row, never wrapping */}
            <div className="mt-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2">
                <CategoryChip
                  label="All"
                  count={available.length}
                  active={categoryId === 'all'}
                  onClick={() => setCategoryId('all')}
                />
                {usableCategories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    count={available.filter((i) => i.category_id === c.id).length}
                    active={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 py-3 sm:px-5">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className="group flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex w-full items-start gap-1.5">
                      <FoodTypeDot type={item.food_type} />
                      <span className="min-w-0 flex-1 text-xs leading-snug font-medium break-words sm:text-sm">
                        {item.name}
                      </span>
                    </span>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatMoney(item.price)}
                      </span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        {itemsWithOptions && !itemsWithOptions.has(item.id) ? 'ADD' : 'OPTIONS'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {visibleItems.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {search ? 'No items match your search.' : 'Nothing available in this category.'}
                </p>
              )}
            </div>
          </div>

          {/* ---- Draft order ---- */}
          <div className="flex max-h-[38dvh] min-h-0 shrink-0 flex-col border-t bg-muted/30 md:max-h-none md:border-t-0 md:border-l">
            <div className="flex items-baseline justify-between border-b px-4 py-2.5">
              <p className="text-sm font-medium">Order</p>
              {totalQty > 0 && (
                <span className="text-xs text-muted-foreground">
                  {totalQty} item{totalQty === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {draft.map((l) => (
                <div key={l.key} className="rounded-lg border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs leading-snug font-medium break-words">
                        {l.item_name}
                        {l.variant_name ? ` · ${l.variant_name}` : ''}
                      </p>
                      {l.addon_label && (
                        <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                          {l.addon_label}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => changeQty(l.key, -l.qty)}
                      aria-label={`Remove ${l.item_name}`}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="size-6 p-0"
                        onClick={() => changeQty(l.key, -1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-xs font-medium tabular-nums">{l.qty}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="size-6 p-0"
                        onClick={() => changeQty(l.key, 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </Button>
                    </div>
                    <span className="text-xs font-medium tabular-nums">
                      {formatMoney(l.unit_price * l.qty)}
                    </span>
                  </div>
                </div>
              ))}

              {draft.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Tap an item to start the order.
                </p>
              )}
            </div>

            <div className="space-y-2 border-t px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-base font-semibold tabular-nums">{formatMoney(total)}</span>
              </div>
              <Button
                className="w-full"
                onClick={handleConfirm}
                disabled={submitting || draft.length === 0}
              >
                {submitting ? 'Working…' : `${confirmLabel}${totalQty > 0 ? ` (${totalQty})` : ''}`}
              </Button>
            </div>
          </div>
        </div>

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

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:bg-muted'
      }`}
    >
      {label}
      <span className={active ? 'text-primary-foreground/70' : 'text-muted-foreground'}>{count}</span>
    </button>
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

  // A variant is a choice between prices, so leaving it unset would silently bill the
  // base price for an item that has none.
  const needsVariant = variants.length > 0 && !variantId

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
      <DialogContent className="flex max-h-[85dvh] w-[92vw] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="pr-6">{itemName}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Variant <span className="text-xs font-normal text-muted-foreground">(required)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <OptionChip
                    key={v.id}
                    active={variantId === v.id}
                    onClick={() => setVariantId(v.id)}
                    label={v.name}
                    price={formatMoney(v.price)}
                  />
                ))}
              </div>
            </div>
          )}

          {addonGroups.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="text-sm font-medium">
                {g.name}
                {g.max_select > 0 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (max {g.max_select})
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.addons.map((a) => (
                  <OptionChip
                    key={a.id}
                    active={addonIds.includes(a.id)}
                    onClick={() => toggleAddon(a.id)}
                    label={a.name}
                    price={`+${formatMoney(a.price)}`}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Quantity</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                −
              </Button>
              <Input
                type="number"
                min={1}
                className="w-14 text-center"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
              >
                +
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t px-4 py-3">
          <Button className="w-full" onClick={confirm} disabled={needsVariant}>
            {needsVariant ? 'Choose a variant' : `Add · ${formatMoney(unitPrice * qty)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OptionChip({
  active,
  onClick,
  label,
  price,
}: {
  active: boolean
  onClick: () => void
  label: string
  price: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:bg-muted'
      }`}
    >
      {label} <span className={active ? 'text-primary-foreground/70' : 'text-muted-foreground'}>{price}</span>
    </button>
  )
}
