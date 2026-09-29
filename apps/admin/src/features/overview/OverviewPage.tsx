import { useQuery } from '@tanstack/react-query'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/features/auth/AuthProvider'
import { fetchOverview } from './api'
import { AlertsPanel } from './AlertsPanel'
import { FloorMiniMap } from './FloorMiniMap'
import { StatTile } from './StatTile'
import { PartToWholeBar, SalesByHourChart, TopDishesChart, Trend7dChart } from './charts'

const OVERVIEW_KEY = ['overview'] as const

export function OverviewPage() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: OVERVIEW_KEY, queryFn: fetchOverview })

  useRealtimeInvalidate('orders', [OVERVIEW_KEY])
  useRealtimeInvalidate('order_items', [OVERVIEW_KEY])
  useRealtimeInvalidate('bills', [OVERVIEW_KEY])
  useRealtimeInvalidate('payments', [OVERVIEW_KEY])
  useRealtimeInvalidate('tables', [OVERVIEW_KEY])

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>
  }

  const greeting = getGreeting()

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl bg-gradient-to-r from-[#FFF7F2] to-[#FFF0E8] border border-[#FDDCC8] px-4 py-4 sm:px-6 sm:py-5">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {greeting}, {profile?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's what's happening at Aroma Cafe today.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Today's sales" value={formatMoney(data.todaySalesPaise)} />
        <StatTile label="Orders today" value={String(data.ordersToday)} />
        <StatTile label="Average bill" value={formatMoney(data.avgBillPaise)} />
        <StatTile label="Covers today" value={String(data.coversToday)} />
        <StatTile label="Free / Occupied" value={`${data.tablesFree} / ${data.tablesOccupied}`} />
        <StatTile label="In kitchen" value={String(data.ordersInKitchen)} />
        <StatTile
          label="Pending payments"
          value={String(data.pendingPayments)}
          tone={data.pendingPayments > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesByHourChart data={data.salesByHour} />
        <Trend7dChart data={data.trend7d} />
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TopDishesChart data={data.topDishes} />
        <div className="space-y-4">
          <PartToWholeBar
            title="Sales by category"
            data={data.salesByCategory.map((c) => ({ name: c.name, valuePaise: c.revenuePaise }))}
          />
          <PartToWholeBar
            title="Payment modes"
            data={data.paymentModeSplit.map((p) => ({ name: p.mode, valuePaise: p.amountPaise }))}
          />
        </div>
      </div>

      {/* Floor map + alerts */}
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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
