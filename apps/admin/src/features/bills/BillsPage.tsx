import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useEnumOptions } from '@/lib/enums'
import { formatMoney } from '@/lib/money'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { BillPanel } from '@/features/live-orders/BillPanel'
import { addPayment, applyDiscount, markPaid, voidBill } from '@/features/live-orders/api'
import { CounterBillDialog } from './CounterBillDialog'
import { fetchBillDetail, fetchBills, voidBillWithReason, type BillFilters, type BillStatus } from './api'

const BILLS_KEY = ['bills'] as const

const STATUS_VARIANT: Record<BillStatus, 'default' | 'secondary' | 'destructive'> = {
  open: 'secondary',
  paid: 'default',
  void: 'destructive',
}

function presetRange(preset: string): { from?: string; to?: string } {
  const now = new Date()
  if (preset === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString() }
  }
  if (preset === '7d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    return { from: start.toISOString() }
  }
  if (preset === '30d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 30)
    return { from: start.toISOString() }
  }
  return {}
}

export function BillsPage() {
  const { profile } = useAuth()
  const canVoid = profile?.role === 'super_admin' || profile?.role === 'manager'
  // Counter sales are a till action, so cashiers get it too.
  const canBill = canVoid || profile?.role === 'cashier'
  const [counterOpen, setCounterOpen] = useState(false)
  const billStatuses = useEnumOptions('bill_status')

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: BILLS_KEY })
    queryClient.invalidateQueries({ queryKey: ['bill-detail', selectedBillId] })
  }
  const queryClient = useQueryClient()

  const [preset, setPreset] = useState('7d')
  const [status, setStatus] = useState<BillStatus | 'all'>('all')
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null)

  // presetRange() reads `new Date()`, so it must be memoized on `preset`/`status` alone --
  // recomputing it on every render would put a new millisecond timestamp in the query key each
  // time and refetch forever.
  const filters: BillFilters = useMemo(() => ({ ...presetRange(preset), status }), [preset, status])
  const billsKey = [...BILLS_KEY, filters] as const

  const { data: bills = [], isLoading } = useQuery({ queryKey: billsKey, queryFn: () => fetchBills(filters) })
  useRealtimeInvalidate('bills', [BILLS_KEY])

  const { data: detail } = useQuery({
    queryKey: ['bill-detail', selectedBillId],
    queryFn: () => fetchBillDetail(selectedBillId!),
    enabled: !!selectedBillId,
  })

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidBillWithReason(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BILLS_KEY })
      queryClient.invalidateQueries({ queryKey: ['bill-detail', selectedBillId] })
      toast.success('Bill voided')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not void bill'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Bills</h1>
          <p className="text-sm text-muted-foreground">Every bill, filterable by date and status.</p>
        </div>
        {canBill && (
          <Button onClick={() => setCounterOpen(true)}>New counter bill</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as BillStatus | 'all')}>
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {billStatuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading bills…</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill no.</TableHead>
                <TableHead>Table</TableHead>
                <TableHead className="hidden sm:table-cell">Served by</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => setSelectedBillId(b.id)}>
                  <TableCell>{b.bill_no ?? '—'}</TableCell>
                  <TableCell>
                    <span className={b.table_deleted ? 'text-destructive' : undefined}>
                      {b.table_name}
                    </span>
                    {b.floor_name && (
                      <span className="block text-xs text-muted-foreground">{b.floor_name}</span>
                    )}
                    {b.table_deleted && (
                      <span className="block text-xs font-medium text-destructive">
                        deleted table
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{b.staff_name ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</TableCell>
                  <TableCell>{formatMoney(b.total)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No bills in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CounterBillDialog
        open={counterOpen}
        onOpenChange={setCounterOpen}
        onDone={() => queryClient.invalidateQueries({ queryKey: BILLS_KEY })}
      />

      <Sheet open={!!selectedBillId} onOpenChange={(open) => !open && setSelectedBillId(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.bill_no ?? 'Open bill'}</SheetTitle>
                <SheetDescription>
                  <span className={detail.table_deleted ? 'text-destructive' : undefined}>
                    {detail.table_name}
                  </span>
                  {detail.floor_name ? ` · ${detail.floor_name}` : ''}
                  {detail.table_deleted && (
                    <span className="font-medium text-destructive"> · deleted table</span>
                  )}
                  {' · '}
                  {new Date(detail.created_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4">
                <div className="space-y-1">
                  {detail.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className={item.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                        {item.qty}× {item.name}
                        {item.variant_name ? ` (${item.variant_name})` : ''}
                      </span>
                      <span>{formatMoney(item.unit_price * item.qty)}</span>
                    </div>
                  ))}
                </div>
                {detail.status === 'open' ? (
                  // An open bill is still actionable — discount, take payment, settle or
                  // void — so it gets the same panel the live-orders screen uses rather
                  // than a read-only summary that dead-ends.
                  <BillPanel
                    bill={{
                      id: detail.id,
                      subtotal: detail.subtotal,
                      discount: detail.discount,
                      service_charge: detail.service_charge,
                      tax_total: detail.tax_total,
                      round_off: detail.round_off,
                      total: detail.total,
                      status: detail.status,
                      bill_no: detail.bill_no,
                    }}
                    payments={detail.payments}
                    canManage={canBill}
                    hasItems
                    onCreateBill={async () => {}}
                    onApplyDiscount={async (paise, reason) => {
                      await applyDiscount(detail.id, paise, reason)
                      refreshDetail()
                    }}
                    onAddPayment={async (mode, paise, reference) => {
                      await addPayment(detail.id, mode, paise, reference)
                      refreshDetail()
                    }}
                    onMarkPaid={async () => {
                      await markPaid(detail.id)
                      toast.success('Bill settled')
                      refreshDetail()
                    }}
                    onVoidBill={async (reason) => {
                      await voidBill(detail.id, reason)
                      toast.success('Bill voided')
                      refreshDetail()
                    }}
                  />
                ) : (
                  <dl className="space-y-1 border-t pt-3 text-sm">
                    <Row label="Subtotal" value={formatMoney(detail.subtotal)} />
                    <Row label="Discount" value={`- ${formatMoney(detail.discount)}`} />
                    <Row label="Service charge" value={formatMoney(detail.service_charge)} />
                    <Row label="Tax" value={formatMoney(detail.tax_total)} />
                    <Row label="Round off" value={formatMoney(detail.round_off)} />
                    <Row label="Total" value={formatMoney(detail.total)} bold />
                  </dl>
                )}
                {detail.payments.length > 0 && (
                  <div className="border-t pt-3 text-sm">
                    <p className="mb-1 font-medium">Payments</p>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-muted-foreground">
                        <span>
                          {p.mode} {p.reference ? `(${p.reference})` : ''}
                        </span>
                        <span>{formatMoney(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {detail.status === 'void' && detail.void_reason && (
                  <p className="border-t pt-3 text-sm text-destructive">Voided: {detail.void_reason}</p>
                )}
                {canVoid && detail.status === 'paid' && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      const reason = window.prompt('Reason for voiding this bill?')
                      if (reason) voidMutation.mutate({ id: detail.id, reason })
                    }}
                  >
                    Void bill
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
