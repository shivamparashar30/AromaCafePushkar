import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TABLE_STATUS_LABEL as STATUS_LABEL, TABLE_STATUS_STYLE as STATUS_STYLE } from '@/lib/table-status'
import { cn } from '@/lib/utils'
import type { OverviewData } from './api'

export function FloorMiniMap({ floorMap }: { floorMap: OverviewData['floorMap'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Floor map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {floorMap.length === 0 && <p className="text-sm text-muted-foreground">No tables yet.</p>}
        {floorMap.map((floor) => (
          <div key={floor.floorName}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{floor.floorName}</p>
            <div className="flex flex-wrap gap-2">
              {floor.tables.map((t) => (
                <div
                  key={t.id}
                  title={STATUS_LABEL[t.status] ?? t.status}
                  className={cn(
                    'flex h-12 w-16 items-center justify-center rounded-md border text-sm font-medium',
                    STATUS_STYLE[t.status],
                  )}
                >
                  {t.name}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full border', STATUS_STYLE[key])} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
