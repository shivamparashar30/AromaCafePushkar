import { useState } from 'react'
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
  const [saving, setSaving] = useState(false)

  const isOffice = OFFICE_ROLES.includes(role)

  function handleOpenChange(next: boolean) {
    if (next && editing) {
      setName(editing.name)
      setPhone(editing.phone)
      setRole(editing.role)
      setPin('')
      setEmail('')
      setPassword('')
    } else if (next) {
      setName('')
      setPhone('+91')
      setRole('waiter')
      setPin('')
      setEmail('')
      setPassword('')
    }
    onOpenChange(next)
  }

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                <Input id="emp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
