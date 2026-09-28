import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { fetchFloors } from '@/features/tables/api'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { TABLE_STATUS_LABEL, TABLE_STATUS_STYLE } from '@/lib/table-status'
import { cn } from '@/lib/utils'
import {
  addPayment,
  applyDiscount,
  cancelItem,
  claimTable,
  createBill,
  fetchSessionDetail,
  markPaid,
  placeOrder,
  voidBill,
  type PaymentMode,
  type PlaceOrderItem,
} from './api'
import { BillPanel } from './BillPanel'
import { ItemPickerDialog } from './ItemPickerDialog'
import { OrderList } from './OrderList'

const FLOORS_KEY = ['floors-with-tables'] as const

export function LiveOrdersPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'super_admin' || profile?.role === 'manager' || profile?.role === 'cashier'
  // claim_table (Open table) is restricted server-side to waiter/manager/super_admin -- cashier
  // can manage bills/orders on an already-open table, but doesn't open new ones.
  const canClaim = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: floors } = useQuery({ queryKey: FLOORS_KEY, queryFn: fetchFloors })
  useRealtimeInvalidate('tables', [FLOORS_KEY])

  const sessionKey = ['session-detail', selectedTableId] as const
  const { data: detail } = useQuery({
    queryKey: sessionKey,
    queryFn: () => fetchSessionDetail(selectedTableId!),
    enabled: !!selectedTableId,
  })

  useRealtimeInvalidate('table_sessions', [sessionKey, FLOORS_KEY])
  useRealtimeInvalidate('orders', [sessionKey])
  useRealtimeInvalidate('order_items', [sessionKey])
  useRealtimeInvalidate('bills', [sessionKey, FLOORS_KEY])
  useRealtimeInvalidate('payments', [sessionKey])

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: sessionKey })
    queryClient.invalidateQueries({ queryKey: FLOORS_KEY })
  }

  const claimMutation = useMutation({
    mutationFn: claimTable,
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message ?? 'Could not claim table'),
  })

  const placeOrderMutation = useMutation({
    mutationFn: (items: PlaceOrderItem[]) => placeOrder(detail!.session!.id, items),
    onSuccess: () => {
      invalidateAll()
      toast.success('Order placed')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not place order'),
  })

  const cancelItemMutation = useMutation({
    mutationFn: (itemId: string) => {
      const reason = window.prompt('Reason for cancelling this item?') ?? ''
      return cancelItem(itemId, reason)
    },
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message ?? 'Could not cancel item'),
  })

  if (!floors) return <p className="text-sm text-muted-foreground">Loading tables…</p>

  const allTables = floors.flatMap((f) => f.tables.map((t) => ({ ...t, floorName: f.name })))
  const selectedTable = allTables.find((t) => t.id === selectedTableId)

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Live table ordering</h1>
        <div className="space-y-3">
          {floors.map((floor) => (
            <div key={floor.id}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{floor.name}</p>
              <div className="grid grid-cols-3 gap-2">
                {floor.tables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTableId(t.id)}
                    className={cn(
                      'rounded-md border p-2 text-center text-sm',
                      TABLE_STATUS_STYLE[t.status],
                      selectedTableId === t.id && 'ring-2 ring-primary',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {!selectedTable ? (
          <p className="text-sm text-muted-foreground">Select a table to view its order.</p>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selectedTable.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {TABLE_STATUS_LABEL[selectedTable.status] ?? selectedTable.status}
                  {detail.session?.guest_count ? ` · ${detail.session.guest_count} guests` : ''}
                </p>
              </div>
              {!detail.session && canClaim && (
                <Button onClick={() => claimMutation.mutate(selectedTable.id)}>Open table</Button>
              )}
              {detail.session && detail.bill?.status !== 'paid' && (
                <Button onClick={() => setPickerOpen(true)}>Add items</Button>
              )}
            </div>

            {detail.session && (
              <div className="grid grid-cols-[1fr_320px] gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Order</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OrderList
                      orders={detail.orders}
                      canCancel={canManage}
                      onCancelItem={(id) => cancelItemMutation.mutate(id)}
                    />
                  </CardContent>
                </Card>

                <BillPanel
                  bill={detail.bill}
                  payments={detail.payments}
                  canManage={canManage}
                  onCreateBill={async () => {
                    await createBill(detail.session!.id)
                    invalidateAll()
                  }}
                  onApplyDiscount={async (discountPaise, reason) => {
                    await applyDiscount(detail.bill!.id, discountPaise, reason)
                    invalidateAll()
                  }}
                  onAddPayment={async (mode: PaymentMode, amountPaise, reference) => {
                    await addPayment(detail.bill!.id, mode, amountPaise, reference)
                    invalidateAll()
                  }}
                  onMarkPaid={async () => {
                    await markPaid(detail.bill!.id)
                    invalidateAll()
                    toast.success('Bill paid — table freed for cleaning')
                  }}
                  onVoidBill={async (reason) => {
                    await voidBill(detail.bill!.id, reason)
                    invalidateAll()
                  }}
                />
              </div>
            )}

            <ItemPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onConfirm={async (items) => placeOrderMutation.mutateAsync(items)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
