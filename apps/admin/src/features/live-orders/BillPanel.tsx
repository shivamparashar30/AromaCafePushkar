import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMoney, rupeesToPaise } from '@/lib/money'
import type { PaymentMode, SessionDetail } from './api'

export function BillPanel({
  bill,
  payments,
  canManage,
  onCreateBill,
  onApplyDiscount,
  onAddPayment,
  onMarkPaid,
  onVoidBill,
}: {
  bill: SessionDetail['bill']
  payments: SessionDetail['payments']
  canManage: boolean
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
        <CardContent>
          <Button disabled={!canManage || busy} onClick={() => run(onCreateBill)}>
            Create bill
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bill {bill.bill_no ? `#${bill.bill_no}` : '(open)'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" value={formatMoney(bill.subtotal)} />
          <Row label="Discount" value={`- ${formatMoney(bill.discount)}`} />
          <Row label="Service charge" value={formatMoney(bill.service_charge)} />
          <Row label="Tax" value={formatMoney(bill.tax_total)} />
          <Row label="Round off" value={formatMoney(bill.round_off)} />
          <Row label="Total" value={formatMoney(bill.total)} bold />
          <Row label="Paid" value={formatMoney(paid)} />
          <Row label="Remaining" value={formatMoney(remaining)} bold={remaining > 0} />
        </dl>

        {canManage && (
          <>
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Apply discount</p>
              <div className="flex gap-2">
                <Input
                  placeholder="₹"
                  className="w-24"
                  value={discountRupees}
                  onChange={(e) => setDiscountRupees(e.target.value)}
                />
                <Input
                  placeholder="Reason"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={busy || !discountRupees}
                  onClick={() =>
                    run(() => onApplyDiscount(rupeesToPaise(Number(discountRupees)), discountReason))
                  }
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Record payment</p>
              <div className="flex gap-2">
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Amount ₹"
                  className="w-24"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                <Input placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                <Button
                  variant="outline"
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
              </div>
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

            <div className="flex items-center justify-between border-t pt-3">
              <Button disabled={busy || remaining !== 0} onClick={() => run(onMarkPaid)}>
                Mark paid
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
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
