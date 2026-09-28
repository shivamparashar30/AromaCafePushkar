import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OverviewData } from './api'

export function AlertsPanel({
  slowOrders,
  billRequestedTables,
  whatsappFailedCount,
}: Pick<OverviewData, 'slowOrders' | 'billRequestedTables' | 'whatsappFailedCount'>) {
  const alerts: { text: string; tone: 'warning' | 'critical' }[] = [
    ...slowOrders.map((s) => ({
      text: `${s.table}: order waiting ${s.minutes} min in the kitchen`,
      tone: s.minutes >= 30 ? ('critical' as const) : ('warning' as const),
    })),
    ...billRequestedTables.map((t) => ({ text: `${t}: bill requested`, tone: 'warning' as const })),
    ...(whatsappFailedCount > 0
      ? [{ text: `${whatsappFailedCount} WhatsApp bill send(s) failed`, tone: 'critical' as const }]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All clear — no alerts right now.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      a.tone === 'critical' ? 'var(--status-critical)' : 'var(--status-warning)',
                  }}
                />
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
