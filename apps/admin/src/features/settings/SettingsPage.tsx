import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  createTaxGroup,
  fetchOutletSettings,
  fetchTaxGroups,
  updateOutletDetails,
  updateOutletSettings,
  updateTaxGroup,
  type OutletSettings,
  type TaxGroup,
} from './api'

const OUTLET_KEY = ['outlet-settings'] as const
const TAX_KEY = ['settings-tax-groups'] as const

export function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: outlet, isLoading } = useQuery({ queryKey: OUTLET_KEY, queryFn: fetchOutletSettings })
  const { data: taxGroups = [] } = useQuery({ queryKey: TAX_KEY, queryFn: fetchTaxGroups })

  if (isLoading || !outlet) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Outlet details, ordering options, tax configuration.</p>
      </div>

      <OutletDetailsCard
        outlet={outlet}
        onSaved={() => queryClient.invalidateQueries({ queryKey: OUTLET_KEY })}
      />

      <OrderingSettingsCard
        outlet={outlet}
        onSaved={() => queryClient.invalidateQueries({ queryKey: OUTLET_KEY })}
      />

      <TaxGroupsCard
        taxGroups={taxGroups}
        onSaved={() => queryClient.invalidateQueries({ queryKey: TAX_KEY })}
      />
    </div>
  )
}

function OutletDetailsCard({ outlet, onSaved }: { outlet: OutletSettings; onSaved: () => void }) {
  const [name, setName] = useState(outlet.name)
  const [address, setAddress] = useState(outlet.address ?? '')
  const [gstin, setGstin] = useState(outlet.gstin ?? '')
  const [fssai, setFssai] = useState(outlet.fssai ?? '')

  const mutation = useMutation({
    mutationFn: () => updateOutletDetails({ name, address, gstin, fssai }),
    onSuccess: () => { onSaved(); toast.success('Details saved') },
    onError: () => toast.error('Could not save details'),
  })

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Outlet details</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>GSTIN</Label>
            <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>FSSAI License</Label>
            <Input value={fssai} onChange={(e) => setFssai(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save details'}
        </Button>
      </CardContent>
    </Card>
  )
}

function OrderingSettingsCard({ outlet, onSaved }: { outlet: OutletSettings; onSaved: () => void }) {
  const s = outlet.settings ?? {}
  const ordering = s.ordering ?? {}
  const sc = s.service_charge ?? {}

  const [userOrdering, setUserOrdering] = useState(ordering.user_ordering ?? false)
  const [onlineOrdering, setOnlineOrdering] = useState(ordering.online_ordering ?? false)
  const [onlinePayment, setOnlinePayment] = useState(ordering.online_payment ?? false)
  const [firstOrderConfirm, setFirstOrderConfirm] = useState(ordering.first_order_needs_confirmation ?? false)
  const [directTakeover, setDirectTakeover] = useState(ordering.allow_direct_table_takeover ?? false)
  const [scEnabled, setScEnabled] = useState(sc.enabled ?? false)
  const [scPercent, setScPercent] = useState(String(sc.percent ?? 0))
  const [billPrefix, setBillPrefix] = useState(s.bill_prefix ?? 'INV')

  const mutation = useMutation({
    mutationFn: () =>
      updateOutletSettings({
        ordering: {
          user_ordering: userOrdering,
          online_ordering: onlineOrdering,
          online_payment: onlinePayment,
          first_order_needs_confirmation: firstOrderConfirm,
          allow_direct_table_takeover: directTakeover,
        },
        service_charge: { enabled: scEnabled, percent: Number(scPercent) },
        bill_prefix: billPrefix,
      }),
    onSuccess: () => { onSaved(); toast.success('Settings saved') },
    onError: () => toast.error('Could not save settings'),
  })

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ordering & billing</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <SettingRow label="Customer QR ordering" checked={userOrdering} onChange={setUserOrdering} />
          <SettingRow label="Online ordering" checked={onlineOrdering} onChange={setOnlineOrdering} />
          <SettingRow label="Online payment" checked={onlinePayment} onChange={setOnlinePayment} />
          <SettingRow label="First order needs waiter confirmation" checked={firstOrderConfirm} onChange={setFirstOrderConfirm} />
          <SettingRow label="Allow direct table takeover" checked={directTakeover} onChange={setDirectTakeover} />
        </div>
        <Separator />
        <div className="flex items-center gap-4">
          <SettingRow label="Service charge" checked={scEnabled} onChange={setScEnabled} />
          {scEnabled && (
            <div className="flex items-center gap-1">
              <Input className="w-20" type="number" value={scPercent} onChange={(e) => setScPercent(e.target.value)} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Label className="min-w-[180px]">Bill prefix</Label>
          <Input className="w-24" value={billPrefix} onChange={(e) => setBillPrefix(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="min-w-[180px]">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function TaxGroupsCard({ taxGroups, onSaved }: { taxGroups: TaxGroup[]; onSaved: () => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [tName, setTName] = useState('')
  const [cgst, setCgst] = useState('')
  const [sgst, setSgst] = useState('')

  const createMutation = useMutation({
    mutationFn: () => createTaxGroup({ name: tName, cgst_percent: Number(cgst), sgst_percent: Number(sgst) }),
    onSuccess: () => { onSaved(); setFormOpen(false); toast.success('Tax group added') },
    onError: () => toast.error('Could not add tax group'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateTaxGroup(id, { is_active: active }),
    onSuccess: onSaved,
    onError: () => toast.error('Could not update tax group'),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Tax groups</CardTitle>
        <Button size="sm" variant="outline" onClick={() => { setTName(''); setCgst(''); setSgst(''); setFormOpen(true) }}>
          Add tax group
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">CGST %</TableHead>
              <TableHead className="text-right">SGST %</TableHead>
              <TableHead className="text-right">Total %</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taxGroups.map((tg) => (
              <TableRow key={tg.id}>
                <TableCell className="font-medium">{tg.name}</TableCell>
                <TableCell className="text-right">{tg.cgst_percent}</TableCell>
                <TableCell className="text-right">{tg.sgst_percent}</TableCell>
                <TableCell className="text-right">{tg.cgst_percent + tg.sgst_percent}%</TableCell>
                <TableCell>
                  <Switch
                    checked={tg.is_active}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: tg.id, active: v })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add tax group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder='e.g. "Food (5% GST)"' />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CGST %</Label>
                  <Input type="number" step="0.01" value={cgst} onChange={(e) => setCgst(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>SGST %</Label>
                  <Input type="number" step="0.01" value={sgst} onChange={(e) => setSgst(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !tName}>
                {createMutation.isPending ? 'Adding…' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
