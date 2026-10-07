import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setSessionCustomer } from '@/features/bills/api'

/**
 * Digits only, at most ten.
 *
 * A pasted "+91 98765 43210" is accepted by dropping the country code, but only when the
 * result is longer than ten digits — stripping a leading "91" unconditionally would
 * corrupt a genuine number such as 9123456789.
 */
export function clampPhone(value: string) {
  let digits = value.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
  return digits.slice(0, 10)
}

export function isValidPhone(value: string) {
  return /^[6-9]\d{9}$/.test(clampPhone(value))
}

/**
 * Attaches a guest to a table session.
 *
 * A QR order captures name and phone up front, so that spend lands on the customer record.
 * An order taken by a waiter or entered here had no such step, so the sale was anonymous
 * and never counted toward the guest's visits or lifetime spend. This closes that gap for
 * staff-taken orders — the phone is what links the session, and every bill on it, to the
 * customer.
 */
export function SessionCustomerDialog({
  sessionId,
  currentName,
  currentPhone,
  open,
  onOpenChange,
  onSaved,
}: {
  sessionId: string | null
  currentName: string | null
  currentPhone: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  // Seeded from an effect: Radix fires onOpenChange only for user-driven opens, and this
  // dialog is opened by the parent setting `open`.
  useEffect(() => {
    if (!open) return
    setName(currentName ?? '')
    setPhone(clampPhone(currentPhone ?? ''))
  }, [open, currentName, currentPhone])

  const phoneOk = phone === '' || isValidPhone(phone)

  async function save() {
    if (!sessionId) return
    setSaving(true)
    try {
      await setSessionCustomer(sessionId, name.trim(), clampPhone(phone))
      toast.success('Customer attached to this table')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not save customer details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{currentPhone ? 'Edit customer' : 'Add customer'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-cust-name">Name</Label>
            <Input
              id="session-cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Guest name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-cust-phone">Mobile number</Label>
            <Input
              id="session-cust-phone"
              value={phone}
              onChange={(e) => setPhone(clampPhone(e.target.value))}
              placeholder="10-digit number"
              inputMode="numeric"
              maxLength={10}
            />
            {!phoneOk && (
              <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>
            )}
            <p className="text-xs text-muted-foreground">
              The number is what links this table&apos;s bills to the customer&apos;s visits and
              lifetime spend.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving || !phoneOk || (!name.trim() && !phone)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
