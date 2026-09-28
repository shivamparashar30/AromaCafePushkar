import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { TABLE_STATUS_LABEL, TABLE_STATUS_STYLE } from '@/lib/table-status'
import { cn } from '@/lib/utils'
import {
  createFloor,
  createTable,
  deleteFloor,
  deleteTable,
  fetchFloors,
  updateTable,
} from './api'
import { AddFloorDialog, AddTableDialog } from './TableDialogs'

const FLOORS_KEY = ['floors-with-tables'] as const

export function TablesPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'manager'
  const queryClient = useQueryClient()

  const { data: floors, isLoading } = useQuery({ queryKey: FLOORS_KEY, queryFn: fetchFloors })

  useRealtimeInvalidate('tables', [FLOORS_KEY])
  useRealtimeInvalidate('floors', [FLOORS_KEY])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: FLOORS_KEY })
  }

  const addFloorMutation = useMutation({
    mutationFn: createFloor,
    onSuccess: invalidate,
    onError: () => toast.error('Could not add floor'),
  })

  const addTableMutation = useMutation({
    mutationFn: createTable,
    onSuccess: invalidate,
    onError: () => toast.error('Could not add table'),
  })

  const deleteFloorMutation = useMutation({
    mutationFn: deleteFloor,
    onSuccess: invalidate,
    onError: () => toast.error('Could not delete floor (it may still have tables)'),
  })

  const deleteTableMutation = useMutation({
    mutationFn: deleteTable,
    onSuccess: invalidate,
    onError: () => toast.error('Could not delete table'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateTable(id, { is_active }),
    onSuccess: invalidate,
    onError: () => toast.error('Could not update table'),
  })

  if (isLoading || !floors) {
    return <p className="text-sm text-muted-foreground">Loading tables…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Table structure</h1>
          <p className="text-sm text-muted-foreground">Floors, areas and tables.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <AddFloorDialog onSubmit={async (name) => addFloorMutation.mutateAsync(name)} />
            <AddTableDialog floors={floors} onSubmit={async (input) => addTableMutation.mutateAsync(input)} />
          </div>
        )}
      </div>

      {floors.length === 0 && (
        <p className="text-sm text-muted-foreground">No floors yet. Add one to get started.</p>
      )}

      {floors.map((floor) => (
        <Card key={floor.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{floor.name}</CardTitle>
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    Delete floor
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{floor.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This only works if the floor has no tables left on it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteFloorMutation.mutate(floor.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardHeader>
          <CardContent>
            {floor.tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tables on this floor yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {floor.tables.map((t) => (
                  <div key={t.id} className={cn('rounded-lg border p-3', !t.is_active && 'opacity-50')}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t.name}</span>
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          TABLE_STATUS_STYLE[t.status],
                        )}
                      >
                        {TABLE_STATUS_LABEL[t.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Seats {t.capacity}</p>
                    {canEdit && (
                      <div className="mt-2 flex items-center justify-between">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() =>
                            toggleActiveMutation.mutate({ id: t.id, is_active: !t.is_active })
                          }
                        >
                          {t.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive">
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete table "{t.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This can't be undone. Existing bills for this table stay in Bills.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteTableMutation.mutate(t.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
