import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AppRole } from '@/features/auth/AuthProvider'
import type { CreateStaffInput, StaffMember, UpdateStaffInput } from './api'

const ROLES: { value: AppRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'kitchen', label: 'Kitchen' },
]

const OFFICE_ROLES: AppRole[] = ['super_admin', 'manager', 'cashier']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: StaffMember | null
  onSubmitCreate: (input: CreateStaffInput) => Promise<void>
  onSubmitUpdate: (input: UpdateStaffInput) => Promise<void>
}

export function EmployeeFormDialog({ open, onOpenChange, editing, onSubmitCreate, onSubmitUpdate }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<AppRole>('waiter')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const isOffice = OFFICE_ROLES.includes(role)

  // Seeded from an effect, not from onOpenChange: Radix fires that only for user-driven
  // opens, and this dialog is opened by setting `open` directly, so editing a staff
  // member showed a blank form.
  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setPhone(editing?.phone ?? '+91')
    setRole(editing?.role ?? 'waiter')
    setPin('')
    setEmail('')
    setPassword('')
  }, [open, editing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await onSubmitUpdate({
          staff_id: editing.id,
          name,
          phone,
          role,
        })
      } else {
        await onSubmitCreate({
          name,
          phone,
          role,
          pin,
          email: isOffice ? email : undefined,
          password: isOffice ? password : undefined,
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit employee' : 'Add employee'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emp-name">Name</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-phone">Phone</Label>
            <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." required />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="emp-pin">PIN (4 digits)</Label>
              <Input id="emp-pin" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} required />
            </div>
          )}
          {!editing && isOffice && (
            <>
              <div className="space-y-2">
                <Label htmlFor="emp-email">Email (for dashboard login)</Label>
                <Input id="emp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-password">Password</Label>
                <div className="relative">
                  <Input id="emp-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" x2="23" y1="1" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
