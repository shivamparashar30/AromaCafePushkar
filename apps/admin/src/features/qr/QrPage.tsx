import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeCanvas } from 'qrcode.react'
import { useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchFloors, regenerateTableQr, type FloorWithTables } from '@/features/tables/api'

const FLOORS_KEY = ['floors-with-tables'] as const

function orderingUrl(domain: string, token: string): string {
  return `https://order.${domain}/t/${token}`
}

export function QrPage() {
  const queryClient = useQueryClient()
  const { data: floors, isLoading } = useQuery({ queryKey: FLOORS_KEY, queryFn: fetchFloors })
  const [domain, setDomain] = useState('aromacafepushkar.example')
  const printRef = useRef<HTMLDivElement>(null)

  const regenerateMutation = useMutation({
    mutationFn: regenerateTableQr,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLOORS_KEY })
      toast.success('QR regenerated — the old printed code will stop working')
    },
    onError: () => toast.error('Could not regenerate QR'),
  })

  function downloadPng(tableName: string, token: string) {
    const canvas = document.getElementById(`qr-${token}`) as HTMLCanvasElement | null
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `table-${tableName}-qr.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function printAll() {
    window.print()
  }

  if (isLoading || !floors) return <p className="text-sm text-muted-foreground">Loading tables…</p>

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-print-sheet, #qr-print-sheet * { visibility: visible; }
          #qr-print-sheet { position: absolute; inset: 0; }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">QR code generator</h1>
          <p className="text-sm text-muted-foreground">
            One unique QR per table, encoding a signed order link.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="domain" className="text-xs">
              Ordering domain
            </Label>
            <Input id="domain" className="w-full sm:w-56" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <Button className="w-full sm:w-auto" onClick={printAll}>Print all (PDF sheet)</Button>
        </div>
      </div>

      <div id="qr-print-sheet" ref={printRef} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {floors.flatMap((floor: FloorWithTables) =>
          floor.tables.map((t) => {
            const url = orderingUrl(domain, t.qr_token)
            return (
              <Card key={t.id} className="break-inside-avoid">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {floor.name} · {t.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3">
                  <QRCodeCanvas id={`qr-${t.qr_token}`} value={url} size={160} level="M" includeMargin />
                  <p className="max-w-full truncate text-xs text-muted-foreground" title={url}>
                    {url}
                  </p>
                  <div className="flex gap-2 print:hidden">
                    <Button size="sm" variant="outline" onClick={() => downloadPng(t.name, t.qr_token)}>
                      Download PNG
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Regenerate
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Regenerate QR for {t.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The old printed QR code will stop working immediately. Use this if it's
                            been copied or misused.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => regenerateMutation.mutate(t.id)}>
                            Regenerate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            )
          }),
        )}
      </div>
    </div>
  )
}
