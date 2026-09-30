import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatMoney } from '@/lib/money'
import { useRealtimeInvalidate } from '@/lib/realtime'
import {
  bulkPriceChangePercent,
  bulkSetInStock,
  createCategory,
  createMenuItem,
  deleteMenuItem,
  fetchCategories,
  fetchMenuItems,
  fetchTaxGroups,
  toggleInStock,
  updateMenuItem,
  type MenuItem,
} from './api'
import { CategoryBar } from './CategoryBar'
import { ItemFormDialog } from './ItemFormDialog'

const CATEGORIES_KEY = ['categories'] as const
const ITEMS_KEY = ['menu-items'] as const
const TAX_GROUPS_KEY = ['tax-groups'] as const

export function MenuPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: fetchCategories })
  const { data: taxGroups = [] } = useQuery({ queryKey: TAX_GROUPS_KEY, queryFn: fetchTaxGroups })
  const { data: items = [], isLoading } = useQuery({ queryKey: ITEMS_KEY, queryFn: fetchMenuItems })

  useRealtimeInvalidate('menu_items', [ITEMS_KEY])
  useRealtimeInvalidate('categories', [CATEGORIES_KEY])

  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [bulkPercent, setBulkPercent] = useState('')

  function invalidateItems() {
    queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
  }

  const addCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
    onError: () => toast.error('Could not add category'),
  })

  const saveItemMutation = useMutation({
    mutationFn: async (input: Parameters<typeof createMenuItem>[0]) =>
      editingItem ? updateMenuItem(editingItem.id, input) : createMenuItem(input),
    onSuccess: () => {
      invalidateItems()
      toast.success(editingItem ? 'Item updated' : 'Item added')
    },
    onError: () => toast.error('Could not save item'),
  })

  const deleteItemMutation = useMutation({
    mutationFn: deleteMenuItem,
    onSuccess: invalidateItems,
    onError: () => toast.error('Could not delete item'),
  })

  const toggleStockMutation = useMutation({
    mutationFn: ({ id, in_stock }: { id: string; in_stock: boolean }) => toggleInStock(id, in_stock),
    onSuccess: invalidateItems,
  })

  const bulkStockMutation = useMutation({
    mutationFn: (in_stock: boolean) => bulkSetInStock(selectedIds, in_stock),
    onSuccess: () => {
      invalidateItems()
      setSelectedIds([])
    },
  })

  const bulkPriceMutation = useMutation({
    mutationFn: (percent: number) => bulkPriceChangePercent(selectedIds, percent),
    onSuccess: () => {
      invalidateItems()
      setSelectedIds([])
      setBulkPercent('')
      toast.success('Prices updated')
    },
  })

  const visibleItems = useMemo(
    () => (selectedCategory === 'all' ? items : items.filter((i) => i.category_id === selectedCategory)),
    [items, selectedCategory],
  )

  function categoryName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading menu…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Menu management</h1>
          <p className="text-sm text-muted-foreground">Categories, items, variants and add-ons.</p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditingItem(null)
              setFormOpen(true)
            }}
          >
            Add item
          </Button>
        )}
      </div>

      <CategoryBar
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        canEdit={canEdit}
        onAdd={async (name) => addCategoryMutation.mutateAsync(name)}
      />

      {canEdit && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <span>{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkStockMutation.mutate(true)}>
            Mark in stock
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkStockMutation.mutate(false)}>
            Mark out of stock
          </Button>
          <Input
            className="w-24"
            placeholder="% change"
            value={bulkPercent}
            onChange={(e) => setBulkPercent(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!bulkPercent}
            onClick={() => bulkPriceMutation.mutate(Number(bulkPercent))}
          >
            Apply price change
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && <TableHead className="w-8" />}
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>In stock</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : undefined}>
                {canEdit && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelectedIds((prev) =>
                          checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="hidden sm:table-cell">{categoryName(item.category_id)}</TableCell>
                <TableCell>{formatMoney(item.price)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline">{item.food_type.replace('_', '-')}</Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.in_stock}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => toggleStockMutation.mutate({ id: item.id, in_stock: checked })}
                  />
                </TableCell>
                {canEdit && (
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => {
                        setEditingItem(item)
                        setFormOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="link" size="sm" className="h-auto p-0 text-destructive">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteItemMutation.mutate(item.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {visibleItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No items in this category yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>


      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        taxGroups={taxGroups}
        editingItem={editingItem}
        onSubmit={async (input) => saveItemMutation.mutateAsync(input)}
      />
    </div>
  )
}
