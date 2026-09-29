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
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="py-4">
        <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</p>
        <p
          className={cn(
            'mt-1.5 text-2xl font-bold',
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
