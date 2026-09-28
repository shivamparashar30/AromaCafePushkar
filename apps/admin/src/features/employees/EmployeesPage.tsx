import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRealtimeInvalidate } from '@/lib/realtime'
import {
  createStaff,
  fetchStaff,
  fetchStaffDevices,
  resetPin,
  revokeDevice,
  toggleStaffActive,
  unrevokeDevice,
  updateStaff,
  type StaffMember,
} from './api'
import { EmployeeFormDialog } from './EmployeeFormDialog'

const STAFF_KEY = ['staff'] as const

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
}

export function EmployeesPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'super_admin'
  const queryClient = useQueryClient()

  const { data: staff = [], isLoading } = useQuery({ queryKey: STAFF_KEY, queryFn: fetchStaff })
  useRealtimeInvalidate('profiles', [STAFF_KEY])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [newPin, setNewPin] = useState('')

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: STAFF_KEY })
  }

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => { invalidate(); toast.success('Employee added') },
    onError: (err: Error) => toast.error(err.message || 'Could not add employee'),
  })

  const updateMutation = useMutation({
    mutationFn: updateStaff,
    onSuccess: () => { invalidate(); toast.success('Employee updated') },
    onError: (err: Error) => toast.error(err.message || 'Could not update employee'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleStaffActive(id, active),
    onSuccess: () => { invalidate(); toast.success('Status updated') },
    onError: (err: Error) => toast.error(err.message || 'Could not update status'),
  })

  const resetPinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => resetPin(id, pin),
    onSuccess: () => { toast.success('PIN reset successfully'); setNewPin('') },
    onError: (err: Error) => toast.error(err.message || 'Could not reset PIN'),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading employees…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Employee management</h1>
          <p className="text-sm text-muted-foreground">Staff members, roles and devices.</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            Add employee
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Status</TableHead>
            {canEdit && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((s) => (
            <TableRow key={s.id} className={!s.is_active ? 'opacity-50' : undefined}>
              <TableCell>
                <button
                  className="font-medium hover:underline text-left"
                  onClick={() => setSelectedStaff(s)}
                >
                  {s.name}
                </button>
              </TableCell>
              <TableCell>{s.phone}</TableCell>
              <TableCell>
                <Badge variant="outline">{ROLE_LABEL[s.role] ?? s.role}</Badge>
              </TableCell>
              <TableCell>{s.joining_date}</TableCell>
              <TableCell>
                <Badge variant={s.is_active ? 'default' : 'secondary'}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              {canEdit && (
                <TableCell className="space-x-2 text-right">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => { setEditing(s); setFormOpen(true) }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => toggleActiveMutation.mutate({ id: s.id, active: !s.is_active })}
                  >
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {staff.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                No employees yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmitCreate={async (input) => createMutation.mutateAsync(input)}
        onSubmitUpdate={async (input) => updateMutation.mutateAsync(input)}
      />

      {/* Staff detail sheet */}
      <Sheet open={!!selectedStaff} onOpenChange={(open) => { if (!open) setSelectedStaff(null) }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedStaff && (
            <StaffDetailSheet
              staff={selectedStaff}
              canEdit={canEdit}
              newPin={newPin}
              onNewPinChange={setNewPin}
              onResetPin={() => resetPinMutation.mutate({ id: selectedStaff.id, pin: newPin })}
              resetPinLoading={resetPinMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function StaffDetailSheet({
  staff,
  canEdit,
  newPin,
  onNewPinChange,
  onResetPin,
  resetPinLoading,
}: {
  staff: StaffMember
  canEdit: boolean
  newPin: string
  onNewPinChange: (v: string) => void
  onResetPin: () => void
  resetPinLoading: boolean
}) {
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['staff-devices', staff.id],
    queryFn: () => fetchStaffDevices(staff.id),
  })

  const queryClient = useQueryClient()
  const revokeMutation = useMutation({
    mutationFn: revokeDevice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-devices', staff.id] }),
    onError: () => toast.error('Could not revoke device'),
  })
  const unrevokeMutation = useMutation({
    mutationFn: unrevokeDevice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-devices', staff.id] }),
    onError: () => toast.error('Could not re-enable device'),
  })

  return (
    <>
      <SheetHeader>
        <SheetTitle>{staff.name}</SheetTitle>
        <SheetDescription>
          {ROLE_LABEL[staff.role] ?? staff.role} &middot; {staff.phone}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-1">Details</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Joined</dt>
            <dd>{staff.joining_date}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{staff.is_active ? 'Active' : 'Inactive'}</dd>
          </dl>
        </div>

        {canEdit && (
          <div>
            <h3 className="text-sm font-medium mb-2">Reset PIN</h3>
            <div className="flex gap-2">
              <Input
                placeholder="New PIN"
                value={newPin}
                onChange={(e) => onNewPinChange(e.target.value)}
                maxLength={6}
                className="w-32"
              />
              <Button size="sm" disabled={!newPin || resetPinLoading} onClick={onResetPin}>
                {resetPinLoading ? 'Resetting…' : 'Reset'}
              </Button>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-2">Registered devices</h3>
          {devicesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices registered.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{d.device_identifier}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.platform} &middot; Last seen: {d.last_seen ? new Date(d.last_seen).toLocaleString() : 'never'}
                    </p>
                  </div>
                  {canEdit && (
                    d.revoked_at ? (
                      <Button size="sm" variant="outline" onClick={() => unrevokeMutation.mutate(d.id)}>
                        Re-enable
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">Revoke</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The staff member won't be able to log in from this device until re-enabled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revokeMutation.mutate(d.id)}>
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
