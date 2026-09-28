import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORICAL, SEQUENTIAL } from '@/lib/chart-colors'
import { formatMoney } from '@/lib/money'

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { value: number; name: string }[]
  label?: string
  formatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}${hour < 12 ? 'am' : 'pm'}`
}

export function SalesByHourChart({ data }: { data: { hour: number; amountPaise: number }[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatHour(d.hour) }))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sales by hour (today)</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {chartData.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v) => formatMoney(v).replace('.00', '')}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                content={<ChartTooltip formatter={(v) => formatMoney(v)} />}
              />
              <Bar dataKey="amountPaise" name="Sales" fill={SEQUENTIAL} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function Trend7dChart({ data }: { data: { bucket: string; netPaise: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Last 7 days</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v) => formatMoney(v).replace('.00', '')}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatMoney(v)} />} />
              <Line
                type="monotone"
                dataKey="netPaise"
                name="Net sales"
                stroke={SEQUENTIAL}
                strokeWidth={2}
                dot={{ r: 4, fill: SEQUENTIAL, stroke: 'var(--card)', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function TopDishesChart({ data }: { data: { name: string; revenuePaise: number }[] }) {
  const chartData = [...data].slice(0, 10).reverse()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top dishes (today)</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        {chartData.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 8, right: 32, top: 8, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--foreground)' }}
              />
              <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip formatter={(v) => formatMoney(v)} />} />
              <Bar dataKey="revenuePaise" name="Revenue" fill={SEQUENTIAL} radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList
                  dataKey="revenuePaise"
                  position="right"
                  formatter={(v: unknown) => formatMoney(Number(v)).replace('.00', '')}
                  style={{ fill: 'var(--foreground)', fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

/** A single-row horizontal stacked bar for part-to-whole splits (sales by category, payment mode). */
export function PartToWholeBar({
  title,
  data,
}: {
  title: string
  data: { name: string; valuePaise: number }[]
}) {
  const total = data.reduce((s, d) => s + d.valuePaise, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 || total === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            <div className="flex h-6 w-full overflow-hidden rounded-md">
              {data.map((d, i) => (
                <div
                  key={d.name}
                  className="h-full first:rounded-l-md last:rounded-r-md"
                  style={{
                    width: `${(d.valuePaise / total) * 100}%`,
                    backgroundColor: CATEGORICAL[i % CATEGORICAL.length],
                    marginRight: i < data.length - 1 ? 2 : 0,
                  }}
                  title={`${d.name}: ${formatMoney(d.valuePaise)}`}
                />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {data.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORICAL[i % CATEGORICAL.length] }}
                  />
                  <span className="truncate text-muted-foreground">{d.name}</span>
                  <span className="ml-auto font-medium">{formatMoney(d.valuePaise)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Nothing to show yet today.
    </div>
  )
}
