import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatMoney } from '@/lib/money'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { CustomerDetailSheet } from './CustomerDetailSheet'
import { createCustomer, fetchCustomers, updateCustomer, type Customer, type CustomerInput } from './api'

const CUSTOMERS_KEY = ['customers'] as const

export function CustomersPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()

  const { data: customers = [], isLoading } = useQuery({ queryKey: CUSTOMERS_KEY, queryFn: fetchCustomers })
  useRealtimeInvalidate('customers', [CUSTOMERS_KEY])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY })
  }

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => { invalidate(); toast.success('Customer added') },
    onError: () => toast.error('Could not add customer'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CustomerInput> }) => updateCustomer(id, input),
    onSuccess: () => { invalidate(); toast.success('Customer updated') },
    onError: () => toast.error('Could not update customer'),
  })

  const totalSpend = customers.reduce((sum, c) => sum + Number(c.total_spend ?? 0), 0)

  const filtered = search
    ? customers.filter(
        (c) =>
          c.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search),
      )
    : customers

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading customers…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} total customers · {formatMoney(totalSpend)} lifetime spend. Tap a row for their bills.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            Add customer
          </Button>
        )}
      </div>

      <Input
        placeholder="Search by name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Total spend</TableHead>
              <TableHead className="hidden md:table-cell">WhatsApp</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => setDetailId(c.id)}
              >
                <TableCell className="font-medium">{c.name || '—'}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell className="text-right">{c.visits}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(c.total_spend)}</TableCell>
                <TableCell className="hidden md:table-cell">{c.whatsapp_opt_in ? 'Yes' : 'No'}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={(e) => { e.stopPropagation(); setEditing(c); setFormOpen(true) }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  {search ? 'No customers match your search.' : 'No customers yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CustomerDetailSheet
        customerId={detailId}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmitCreate={async (input) => createMutation.mutateAsync(input)}
        onSubmitUpdate={async (id, input) => updateMutation.mutateAsync({ id, input })}
      />
    </div>
  )
}

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmitCreate,
  onSubmitUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Customer | null
  onSubmitCreate: (input: CustomerInput) => Promise<void>
  onSubmitUpdate: (id: string, input: Partial<CustomerInput>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState(false)
  const [saving, setSaving] = useState(false)

  // Seeding used to happen inside onOpenChange, which Radix fires only for user-driven
  // opens (trigger, Escape, overlay). The page opens this dialog by setting `open`
  // directly, so that never ran and every edit showed a blank form with the toggle off.
  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setPhone(editing?.phone ?? '')
    setWhatsapp(editing?.whatsapp_opt_in ?? false)
  }, [open, editing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await onSubmitUpdate(editing.id, { name, phone, whatsapp_opt_in: whatsapp })
      } else {
        await onSubmitCreate({ name, phone, whatsapp_opt_in: whatsapp })
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
          <DialogTitle>{editing ? 'Edit customer' : 'Add customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Name</Label>
            <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">Phone</Label>
            <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." required />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} id="cust-wa" />
            <Label htmlFor="cust-wa">WhatsApp opt-in</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
