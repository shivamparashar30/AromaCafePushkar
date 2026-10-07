import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { floorsQuery, FLOORS_QUERY_KEY } from '@/features/tables/api'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { TABLE_STATUS_LABEL, TABLE_STATUS_STYLE } from '@/lib/table-status'
import { cn } from '@/lib/utils'
import {
  addPayment,
  applyDiscount,
  cancelItem,
  markItemServed,
  claimTable,
  createBill,
  fetchSessionDetail,
  freeTable,
  markPaid,
  placeOrder,
  voidBill,
  type PaymentMode,
  type PlaceOrderItem,
} from './api'
import { BillPanel } from './BillPanel'
import { ItemPickerDialog } from './ItemPickerDialog'
import { OrderList } from './OrderList'
import { SessionCustomerDialog } from './SessionCustomerDialog'



export function LiveOrdersPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'super_admin' || profile?.role === 'manager' || profile?.role === 'cashier'
  const canClaim = profile?.role === 'super_admin' || profile?.role === 'manager'
  // cancel_item permits only super_admin and manager (a waiter may cancel an un-started
  // item from the waiter app). canManage includes cashier, so reusing it here offered a
  // button the server always refused.
  const canCancelItems = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)

  const { data: floors } = useQuery({ ...floorsQuery({ onlyActive: true }) })
  useRealtimeInvalidate('tables', [FLOORS_QUERY_KEY])

  const sessionKey = ['session-detail', selectedTableId] as const
  const { data: detail } = useQuery({
    queryKey: sessionKey,
    queryFn: () => fetchSessionDetail(selectedTableId!),
    enabled: !!selectedTableId,
  })

  useRealtimeInvalidate('table_sessions', [sessionKey, FLOORS_QUERY_KEY])
  useRealtimeInvalidate('orders', [sessionKey])
  useRealtimeInvalidate('order_items', [sessionKey])
  useRealtimeInvalidate('bills', [sessionKey, FLOORS_QUERY_KEY])
  useRealtimeInvalidate('payments', [sessionKey])

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: sessionKey })
    queryClient.invalidateQueries({ queryKey: FLOORS_QUERY_KEY })
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
      const reason = window.prompt('Reason for cancelling this item?')
      // Dismissing the prompt means "don't cancel", not "cancel with no reason" — which
      // the server would reject anyway once cooking has started.
      if (reason === null) return Promise.resolve()
      return cancelItem(itemId, reason)
    },
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message ?? 'Could not cancel item'),
  })

  const serveItemMutation = useMutation({
    mutationFn: markItemServed,
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message ?? 'Could not mark item served'),
  })

  const freeTableMutation = useMutation({
    mutationFn: freeTable,
    onSuccess: () => {
      invalidateAll()
      toast.success('Table is now free')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not free table'),
  })

  if (!floors) return <p className="text-sm text-muted-foreground">Loading tables…</p>

  const allTables = floors.flatMap((f) => f.tables.map((t) => ({ ...t, floorName: f.name })))
  const selectedTable = allTables.find((t) => t.id === selectedTableId)

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[260px_1fr] lg:gap-6">
      {/* Table picker */}
      <div className="space-y-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Live table ordering</h1>
        <div className="space-y-3">
          {floors.map((floor) => (
            <div key={floor.id}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{floor.name}</p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-3">
                {floor.tables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTableId(t.id)}
                    className={cn(
                      'rounded-md border p-1.5 text-center text-xs sm:p-2 sm:text-sm',
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

      <SessionCustomerDialog
        sessionId={detail?.session?.id ?? null}
        currentName={detail?.session?.customer_name ?? null}
        currentPhone={detail?.session?.customer_phone ?? null}
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onSaved={invalidateAll}
      />

      {/* Selected table detail */}
      <div className="min-w-0">
        {!selectedTable ? (
          <p className="text-sm text-muted-foreground">Select a table to view its order.</p>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold sm:text-xl">{selectedTable.name}</h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {TABLE_STATUS_LABEL[selectedTable.status] ?? selectedTable.status}
                  {detail.session?.guest_count ? ` · ${detail.session.guest_count} guests` : ''}
                </p>

                {/* A QR order captures the guest up front; an order taken by staff did
                    not, so its revenue never reached the customer record. */}
                {detail.session && (
                  <button
                    type="button"
                    onClick={() => setCustomerOpen(true)}
                    className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline sm:text-sm"
                  >
                    {detail.session.customer_phone ? (
                      <>
                        {detail.session.customer_name || 'Customer'}
                        <span className="text-muted-foreground">
                          ({detail.session.customer_phone})
                        </span>
                        <span className="text-muted-foreground">· edit</span>
                      </>
                    ) : (
                      <>+ Add customer</>
                    )}
                  </button>
                )}
              </div>
              {!detail.session && canClaim && (
                <Button size="sm" onClick={() => claimMutation.mutate(selectedTable.id)}>Open table</Button>
              )}
              {detail.session && detail.bill?.status !== 'paid' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setPickerOpen(true)}>Add items</Button>
                  {canManage &&
                    (detail.orders.length === 0 ||
                      detail.orders.every((o) =>
                        o.items.every((i) => i.status === 'cancelled'),
                      )) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => freeTableMutation.mutate(detail.session!.id)}
                      >
                        Free table
                      </Button>
                    )}
                </div>
              )}
            </div>

            {detail.session && (
              <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1fr_320px]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Order</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OrderList
                      orders={detail.orders}
                      canCancel={canCancelItems}
                      onCancelItem={(id) => cancelItemMutation.mutate(id)}
                      onServeItem={(id) => serveItemMutation.mutate(id)}
                    />
                  </CardContent>
                </Card>

                <BillPanel
                  bill={detail.bill}
                  payments={detail.payments}
                  canManage={canManage}
                  hasItems={detail.orders.some((o) =>
                    o.items.some((i) => i.status !== 'cancelled'),
                  )}
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
                    toast.success('Bill paid — table is now free')
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
