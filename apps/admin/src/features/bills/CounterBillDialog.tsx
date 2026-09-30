import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { BillPanel } from '@/features/live-orders/BillPanel'
import { ItemPickerDialog } from '@/features/live-orders/ItemPickerDialog'
import {
  addPayment,
  applyDiscount,
  fetchSessionDetail,
  markPaid,
  voidBill,
  type PaymentMode,
} from '@/features/live-orders/api'
import { formatMoney } from '@/lib/money'
import { createWalkinBill, setSessionCustomer } from './api'

/**
 * Counter bill: goods handed over at the till, nothing for the kitchen to cook.
 *
 * Step 1 picks the items, step 2 is the ordinary bill panel — the same component the
 * live-orders screen uses — so the breakdown, discount, payment and mark-paid behave
 * identically to a table bill rather than being a second implementation of them.
 */
export function CounterBillDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [tableId, setTableId] = useState<string | null>(null)
  // ItemPickerDialog calls onOpenChange(false) right after a successful confirm. Without
  // this guard that close tore the whole flow down and the bill preview never rendered.
  // A ref, not state, because the close fires synchronously after the await — a state
  // update would not have flushed in time for the handler to see it.
  const advancingRef = useRef(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  // mark_paid closes the session and frees the table, so the session detail empties out
  // straight after. Snapshot what was paid so the confirmation can still show it.
  const [paid, setPaid] = useState<{ billNo: string | null; total: number } | null>(null)

  const detailKey = ['counter-bill', tableId] as const
  const { data: detail, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchSessionDetail(tableId!),
    enabled: !!tableId,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: detailKey })
    onDone()
  }

  function close() {
    advancingRef.current = false
    setPaid(null)
    setTableId(null)
    setCustomerName('')
    setCustomerPhone('')
    onOpenChange(false)
    onDone()
  }

  // Step 1 — items.
  if (!tableId) {
    return (
      <ItemPickerDialog
        open={open}
        onOpenChange={(o) => {
          // Ignore the picker's own close when we are moving on to the bill preview.
          if (!o && advancingRef.current) return
          if (!o) close()
          else onOpenChange(o)
        }}
        title="New counter bill"
        confirmLabel="Create bill"
        onConfirm={async (items) => {
          try {
            // A counter bill never reaches the kitchen: it is a till sale.
            const result = await createWalkinBill(items)
            advancingRef.current = true
            setTableId(result.table_id)
            onDone()
          } catch (e) {
            toast.error((e as Error).message || 'Could not create the counter bill')
            throw e // keep the picker open so the draft survives
          }
        }}
      />
    )
  }

  // Step 2 — the bill itself.
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[92dvh] w-[95vw] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {detail?.bill?.bill_no ?? detail?.table.name ?? 'Counter bill'}
          </DialogTitle>
        </DialogHeader>

        {paid ? (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm font-medium text-green-700 dark:text-green-500">Paid</p>
            <p className="text-3xl font-semibold tabular-nums">{formatMoney(paid.total)}</p>
            {paid.billNo && (
              <p className="text-sm text-muted-foreground">Invoice {paid.billNo}</p>
            )}
            <Button className="w-full" onClick={close}>Done</Button>
          </div>
        ) : isLoading || !detail ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              {detail.orders.flatMap((o) =>
                o.items
                  .filter((i) => i.status !== 'cancelled')
                  .map((i) => (
                    <div key={i.id} className="flex justify-between gap-2">
                      <span>
                        {i.qty}× {i.item_name}
                        {i.variant_name ? ` (${i.variant_name})` : ''}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {(i.unit_price * i.qty / 100).toLocaleString('en-IN', {
                          style: 'currency', currency: 'INR',
                        })}
                      </span>
                    </div>
                  )),
              )}
            </div>

            {/* Optional, and only useful before the bill is settled. */}
            {detail.bill?.status === 'open' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="counter-name" className="text-xs">Customer name</Label>
                  <Input
                    id="counter-name"
                    placeholder="Optional"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    onBlur={() => {
                      if (detail.session && (customerName.trim() || customerPhone.trim())) {
                        setSessionCustomer(detail.session.id, customerName.trim(), customerPhone.trim())
                          .then(refresh)
                          .catch(() => {})
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="counter-phone" className="text-xs">Phone</Label>
                  <Input
                    id="counter-phone"
                    placeholder="Links to spend"
                    inputMode="numeric"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    onBlur={() => {
                      if (detail.session && customerPhone.trim()) {
                        setSessionCustomer(detail.session.id, customerName.trim(), customerPhone.trim())
                          .then(refresh)
                          .catch(() => {})
                      }
                    }}
                  />
                </div>
              </div>
            )}

            <BillPanel
              bill={detail.bill}
              payments={detail.payments}
              canManage
              hasItems
              onCreateBill={async () => { /* already created */ }}
              onApplyDiscount={async (paise, reason) => {
                await applyDiscount(detail.bill!.id, paise, reason)
                refresh()
              }}
              onAddPayment={async (mode: PaymentMode, paise, reference) => {
                await addPayment(detail.bill!.id, mode, paise, reference)
                refresh()
              }}
              onMarkPaid={async () => {
                const billNo = detail.bill!.bill_no
                const total = Number(detail.bill!.total)
                await markPaid(detail.bill!.id)
                setPaid({ billNo, total })
                onDone()
              }}
              onVoidBill={async (reason) => {
                await voidBill(detail.bill!.id, reason)
                toast.success('Counter bill voided')
                close()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
