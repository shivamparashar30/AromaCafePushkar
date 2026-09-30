import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import { fetchCustomerDetail } from './api'
import type { BillStatus } from '@/features/bills/api'

const STATUS_VARIANT: Record<BillStatus, 'default' | 'secondary' | 'destructive'> = {
  open: 'secondary',
  paid: 'default',
  void: 'destructive',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function CustomerDetailSheet({
  customerId,
  onOpenChange,
}: {
  customerId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn: () => fetchCustomerDetail(customerId!),
    enabled: !!customerId,
  })

  return (
    <Sheet open={!!customerId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{data?.customer.name || 'Customer'}</SheetTitle>
          <SheetDescription>
            {data?.customer.phone ? `${data.customer.phone} · ` : ''}
            Customer since {formatDate(data?.customer.created_at ?? null)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Total spent"
                  value={formatMoney(data.customer.total_spend)}
                  hint={`across ${data.paidCount} paid bill${data.paidCount === 1 ? '' : 's'}`}
                />
                <Stat
                  label="Visits"
                  value={String(data.customer.visits)}
                  hint="completed — paid bills only"
                />
                <Stat label="Average bill" value={formatMoney(data.avgBill)} />
                <Stat
                  label="WhatsApp"
                  value={data.customer.whatsapp_opt_in ? 'Opted in' : 'Not opted in'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">First visit</p>
                  <p className="mt-0.5">{formatDate(data.firstVisit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last visit</p>
                  <p className="mt-0.5">{formatDate(data.lastVisit)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Bills <span className="text-muted-foreground">({data.bills.length})</span>
                </h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.bills.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.bill_no ?? '—'}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {b.item_count} item{b.item_count === 1 ? '' : 's'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(b.created_at)}</TableCell>
                          <TableCell>{b.table_name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(b.total)}
                            {b.discount > 0 && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                −{formatMoney(b.discount)} off
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {data.bills.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                            No bills yet. Spend is counted once a bill is marked paid.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
