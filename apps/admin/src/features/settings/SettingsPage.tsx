import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { useAuth } from '@/features/auth/AuthProvider'
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
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: outlet, isLoading } = useQuery({
    queryKey: OUTLET_KEY,
    queryFn: () => fetchOutletSettings(profile!.outlet_id),
    enabled: !!profile,
  })
  const { data: taxGroups = [] } = useQuery({ queryKey: TAX_KEY, queryFn: fetchTaxGroups })

  if (isLoading || !outlet) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Outlet details, billing, tax, and ordering configuration.</p>
      </div>

      <OutletDetailsCard
        outlet={outlet}
        onSaved={() => queryClient.invalidateQueries({ queryKey: OUTLET_KEY })}
      />

      <BillingSettingsCard
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

function BillingSettingsCard({ outlet, onSaved }: { outlet: OutletSettings; onSaved: () => void }) {
  const s = outlet.settings ?? {}
  const sc = s.service_charge ?? {}
  const tax = s.tax ?? {}
  const dd = s.default_discount ?? {}

  const [taxEnabled, setTaxEnabled] = useState(tax.enabled ?? false)
  const [taxPercent, setTaxPercent] = useState(String(tax.percent ?? 0))
  const [scEnabled, setScEnabled] = useState(sc.enabled ?? false)
  const [scPercent, setScPercent] = useState(String(sc.percent ?? 0))
  const [discountEnabled, setDiscountEnabled] = useState(dd.enabled ?? false)
  const [discountPercent, setDiscountPercent] = useState(String(dd.percent ?? 0))
  const [billPrefix, setBillPrefix] = useState(s.bill_prefix ?? 'INV')

  const mutation = useMutation({
    mutationFn: () =>
      updateOutletSettings({
        ...s,
        tax: { enabled: taxEnabled, percent: Number(taxPercent) },
        service_charge: { enabled: scEnabled, percent: Number(scPercent) },
        default_discount: { enabled: discountEnabled, percent: Number(discountPercent) },
        bill_prefix: billPrefix,
      }),
    onSuccess: () => { onSaved(); toast.success('Billing settings saved') },
    onError: () => toast.error('Could not save settings'),
  })

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tax, service charge & discount</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          These are applied automatically when a bill is generated.
        </p>

        {/* Tax */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Tax</p>
              <p className="text-xs text-muted-foreground">Flat tax rate applied on the taxable amount</p>
            </div>
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
          </div>
          {taxEnabled && (
            <div className="flex items-center gap-2">
              <Input className="w-24" type="number" step="0.5" min="0" max="100" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-2">(e.g. 5 for 5% GST)</span>
            </div>
          )}
        </div>

        {/* Service Charge */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Service charge</p>
              <p className="text-xs text-muted-foreground">Added to the bill after discount</p>
            </div>
            <Switch checked={scEnabled} onCheckedChange={setScEnabled} />
          </div>
          {scEnabled && (
            <div className="flex items-center gap-2">
              <Input className="w-24" type="number" step="0.5" min="0" max="100" value={scPercent} onChange={(e) => setScPercent(e.target.value)} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
        </div>

        {/* Default Discount */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Default discount</p>
              <p className="text-xs text-muted-foreground">Auto-applied when bill is created. Can be overridden per bill.</p>
            </div>
            <Switch checked={discountEnabled} onCheckedChange={setDiscountEnabled} />
          </div>
          {discountEnabled && (
            <div className="flex items-center gap-2">
              <Input className="w-24" type="number" step="1" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Bill Prefix */}
        <div className="flex flex-wrap items-center gap-3">
          <Label>Bill prefix</Label>
          <Input className="w-24" value={billPrefix} onChange={(e) => setBillPrefix(e.target.value)} />
        </div>

        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save billing settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

function OrderingSettingsCard({ outlet, onSaved }: { outlet: OutletSettings; onSaved: () => void }) {
  const s = outlet.settings ?? {}
  const ordering = s.ordering ?? {}

  const [userOrdering, setUserOrdering] = useState(ordering.user_ordering ?? false)
  const [onlineOrdering, setOnlineOrdering] = useState(ordering.online_ordering ?? false)
  const [onlinePayment, setOnlinePayment] = useState(ordering.online_payment ?? false)
  const [firstOrderConfirm, setFirstOrderConfirm] = useState(ordering.first_order_needs_confirmation ?? false)
  const [directTakeover, setDirectTakeover] = useState(ordering.allow_direct_table_takeover ?? false)

  const mutation = useMutation({
    mutationFn: () =>
      updateOutletSettings({
        ...s,
        ordering: {
          user_ordering: userOrdering,
          online_ordering: onlineOrdering,
          online_payment: onlinePayment,
          first_order_needs_confirmation: firstOrderConfirm,
          allow_direct_table_takeover: directTakeover,
        },
      }),
    onSuccess: () => { onSaved(); toast.success('Ordering settings saved') },
    onError: () => toast.error('Could not save settings'),
  })

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ordering options</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <SettingRow label="Customer QR ordering" checked={userOrdering} onChange={setUserOrdering} />
          <SettingRow label="Online ordering" checked={onlineOrdering} onChange={setOnlineOrdering} />
          <SettingRow label="Online payment" checked={onlinePayment} onChange={setOnlinePayment} />
          <SettingRow label="First order needs waiter confirmation" checked={firstOrderConfirm} onChange={setFirstOrderConfirm} />
          <SettingRow label="Allow direct table takeover" checked={directTakeover} onChange={setDirectTakeover} />
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save ordering settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
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
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Tax groups (per-item)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Used only if the flat tax rate above is disabled. Assign tax groups to individual menu items.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setTName(''); setCgst(''); setSgst(''); setFormOpen(true) }}>
          Add tax group
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
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
