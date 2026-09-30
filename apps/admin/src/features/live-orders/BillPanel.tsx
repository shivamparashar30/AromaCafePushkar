import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEnumOptions } from '@/lib/enums'
import { formatMoney, rupeesToPaise } from '@/lib/money'
import type { PaymentMode, SessionDetail } from './api'

export function BillPanel({
  bill,
  payments,
  canManage,
  hasItems,
  onCreateBill,
  onApplyDiscount,
  onAddPayment,
  onMarkPaid,
  onVoidBill,
}: {
  bill: SessionDetail['bill']
  payments: SessionDetail['payments']
  canManage: boolean
  /** False when the table has no live (non-cancelled) items — there is nothing to bill. */
  hasItems: boolean
  onCreateBill: () => Promise<void>
  onApplyDiscount: (discountPaise: number, reason: string) => Promise<void>
  onAddPayment: (mode: PaymentMode, amountPaise: number, reference: string) => Promise<void>
  onMarkPaid: () => Promise<void>
  onVoidBill: (reason: string) => Promise<void>
}) {
  const [discountRupees, setDiscountRupees] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const paymentModes = useEnumOptions('payment_mode')

  const paid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const remaining = bill ? Number(bill.total) - paid : 0

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (!bill) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {hasItems
              ? 'Tax, service charge, and discount from settings will be auto-applied.'
              : 'Add at least one item to this table before creating a bill.'}
          </p>
          <Button
            disabled={!canManage || busy}
            onClick={() => {
              // Caught here so the message is immediate; create_bill enforces it server-side too.
              if (!hasItems) {
                toast.error('Nothing to bill yet', {
                  description: 'Add at least one item to this table before creating a bill.',
                })
                return
              }
              run(onCreateBill)
            }}
          >
            Create bill
          </Button>
        </CardContent>
      </Card>
    )
  }

  const discountPct = bill.subtotal > 0
    ? ((Number(bill.discount) / Number(bill.subtotal)) * 100).toFixed(1).replace(/\.0$/, '')
    : '0'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {bill.bill_no ? bill.bill_no : 'Bill'}
          </CardTitle>
          <Badge
            variant={
              bill.status === 'paid' ? 'default'
              : bill.status === 'void' ? 'destructive'
              : 'secondary'
            }
          >
            {bill.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatMoney(bill.subtotal)} />
          {Number(bill.discount) > 0 && (
            <Row label={`Discount (${discountPct}%)`} value={`- ${formatMoney(bill.discount)}`} />
          )}
          {Number(bill.service_charge) > 0 && (
            <Row label="Service charge" value={formatMoney(bill.service_charge)} />
          )}
          {Number(bill.tax_total) > 0 && (
            <Row label="Tax" value={formatMoney(bill.tax_total)} />
          )}
          {Number(bill.round_off) !== 0 && (
            <Row label="Round off" value={formatMoney(bill.round_off)} />
          )}
          <div className="border-t pt-1.5">
            <Row label="Total" value={formatMoney(bill.total)} bold />
          </div>
          {paid > 0 && <Row label="Paid" value={formatMoney(paid)} />}
          {remaining > 0 && <Row label="Remaining" value={formatMoney(remaining)} bold />}
        </dl>

        {canManage && bill.status === 'open' && (
          <>
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Change discount</p>
              <div className="grid grid-cols-[1fr_1fr] gap-2 sm:flex">
                <Input
                  placeholder="Amount ₹"
                  value={discountRupees}
                  onChange={(e) => setDiscountRupees(e.target.value)}
                />
                <Input
                  placeholder="Reason"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={busy || !discountRupees}
                onClick={() =>
                  run(() => onApplyDiscount(rupeesToPaise(Number(discountRupees)), discountReason))
                }
              >
                Apply discount
              </Button>
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Record payment</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentModes.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Amount ₹"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <Input placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={busy || !paymentAmount}
                onClick={() =>
                  run(async () => {
                    await onAddPayment(paymentMode, rupeesToPaise(Number(paymentAmount)), reference)
                    setPaymentAmount('')
                    setReference('')
                  })
                }
              >
                Add payment
              </Button>
              {payments.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {payments.map((p) => (
                    <li key={p.id}>
                      {p.mode} — {formatMoney(p.amount)} {p.reference ? `(${p.reference})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (remaining > 0) {
                      await onAddPayment('cash', remaining, '')
                    }
                    await onMarkPaid()
                  })
                }
              >
                {remaining > 0 ? `Pay ₹${(remaining / 100).toFixed(0)} & close` : 'Mark paid'}
              </Button>
              <Button
                variant="ghost"
                className="text-destructive w-full sm:w-auto"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('Reason for voiding this bill?')
                  if (reason) run(() => onVoidBill(reason))
                }}
              >
                Void bill
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
