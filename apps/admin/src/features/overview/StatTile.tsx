import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'critical'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold',
            tone === 'warning' && 'text-[var(--status-warning)]',
            tone === 'critical' && 'text-[var(--status-critical)]',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
