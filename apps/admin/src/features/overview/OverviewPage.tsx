import { useQuery } from '@tanstack/react-query'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { formatMoney } from '@/lib/money'
import { fetchOverview } from './api'
import { AlertsPanel } from './AlertsPanel'
import { FloorMiniMap } from './FloorMiniMap'
import { StatTile } from './StatTile'
import { PartToWholeBar, SalesByHourChart, TopDishesChart, Trend7dChart } from './charts'

const OVERVIEW_KEY = ['overview'] as const

export function OverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: OVERVIEW_KEY, queryFn: fetchOverview })

  useRealtimeInvalidate('orders', [OVERVIEW_KEY])
  useRealtimeInvalidate('order_items', [OVERVIEW_KEY])
  useRealtimeInvalidate('bills', [OVERVIEW_KEY])
  useRealtimeInvalidate('payments', [OVERVIEW_KEY])
  useRealtimeInvalidate('tables', [OVERVIEW_KEY])

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Today, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Today's sales" value={formatMoney(data.todaySalesPaise)} />
        <StatTile label="Orders today" value={String(data.ordersToday)} />
        <StatTile label="Average bill" value={formatMoney(data.avgBillPaise)} />
        <StatTile label="Covers today" value={String(data.coversToday)} />
        <StatTile label="Tables free / occupied" value={`${data.tablesFree} / ${data.tablesOccupied}`} />
        <StatTile label="Orders in kitchen" value={String(data.ordersInKitchen)} />
        <StatTile
          label="Pending payments"
          value={String(data.pendingPayments)}
          tone={data.pendingPayments > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SalesByHourChart data={data.salesByHour} />
        <Trend7dChart data={data.trend7d} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopDishesChart data={data.topDishes} />
        <div className="space-y-4">
          <PartToWholeBar
            title="Sales by category (today)"
            data={data.salesByCategory.map((c) => ({ name: c.name, valuePaise: c.revenuePaise }))}
          />
          <PartToWholeBar
            title="Payment modes (today)"
            data={data.paymentModeSplit.map((p) => ({ name: p.mode, valuePaise: p.amountPaise }))}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FloorMiniMap floorMap={data.floorMap} />
        <AlertsPanel
          slowOrders={data.slowOrders}
          billRequestedTables={data.billRequestedTables}
          whatsappFailedCount={data.whatsappFailedCount}
        />
      </div>
    </div>
  )
}
