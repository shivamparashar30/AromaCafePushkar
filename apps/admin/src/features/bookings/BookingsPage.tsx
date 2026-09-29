import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRealtimeInvalidate } from '@/lib/realtime'
import {
  createBooking,
  fetchBookings,
  updateBookingStatus,
  type Booking,
  type BookingFilters,
  type BookingSource,
  type BookingStatus,
} from './api'

const BOOKINGS_KEY = ['bookings'] as const

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  booked: 'secondary',
  arrived: 'default',
  no_show: 'destructive',
  cancelled: 'outline',
}

function defaultDateRange(): BookingFilters {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekLater = new Date(today)
  weekLater.setDate(weekLater.getDate() + 7)
  return { from: today.toISOString(), to: weekLater.toISOString() }
}

export function BookingsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<BookingStatus | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)

  const filters: BookingFilters = useMemo(() => ({ ...defaultDateRange(), status }), [status])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: [...BOOKINGS_KEY, filters],
    queryFn: () => fetchBookings(filters),
  })
  useRealtimeInvalidate('bookings', [BOOKINGS_KEY])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY })
  }

  const createMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => { invalidate(); toast.success('Booking created') },
    onError: () => toast.error('Could not create booking'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, s }: { id: string; s: BookingStatus }) => updateBookingStatus(id, s),
    onSuccess: () => { invalidate(); toast.success('Status updated') },
    onError: () => toast.error('Could not update status'),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading bookings…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Bookings overview</h1>
          <p className="text-sm text-muted-foreground">Reservations for the next 7 days.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setFormOpen(true)}>
            New booking
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus | 'all')}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="arrived">Arrived</SelectItem>
            <SelectItem value="no_show">No show</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Party size</TableHead>
              <TableHead>Date & time</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="hidden sm:table-cell">{b.phone}</TableCell>
                <TableCell className="text-right hidden sm:table-cell">{b.party_size}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(b.starts_at).toLocaleString()}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline">{b.source.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[b.status]}>{b.status.replace('_', ' ')}</Badge>
                </TableCell>
                {canEdit && (
                  <TableCell className="space-x-1 text-right">
                    {b.status === 'booked' && (
                      <>
                        <Button
                          variant="link" size="sm" className="h-auto p-0"
                          onClick={() => statusMutation.mutate({ id: b.id, s: 'arrived' })}
                        >
                          Arrived
                        </Button>
                        <Button
                          variant="link" size="sm" className="h-auto p-0"
                          onClick={() => statusMutation.mutate({ id: b.id, s: 'no_show' })}
                        >
                          No show
                        </Button>
                        <Button
                          variant="link" size="sm" className="h-auto p-0 text-destructive"
                          onClick={() => statusMutation.mutate({ id: b.id, s: 'cancelled' })}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {bookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No bookings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <BookingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={async (input) => createMutation.mutateAsync(input)}
      />
    </div>
  )
}

function BookingFormDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: Parameters<typeof createBooking>[0]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [startsAt, setStartsAt] = useState('')
  const [source, setSource] = useState<BookingSource>('phone')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setPhone('')
      setPartySize('2')
      setStartsAt('')
      setSource('phone')
      setNotes('')
    }
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        name,
        phone,
        party_size: Number(partySize),
        starts_at: new Date(startsAt).toISOString(),
        source,
        notes: notes || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bk-name">Guest name</Label>
            <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bk-phone">Phone</Label>
            <Input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bk-size">Party size</Label>
              <Input id="bk-size" type="number" min={1} value={partySize} onChange={(e) => setPartySize(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as BookingSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bk-datetime">Date & time</Label>
            <Input id="bk-datetime" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bk-notes">Notes</Label>
            <Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
