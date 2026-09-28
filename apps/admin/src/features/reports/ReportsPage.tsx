import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SEQUENTIAL } from '@/lib/chart-colors'
import { formatMoney } from '@/lib/money'
import { fetchDishSales, fetchSalesReport, fetchTableSales, type GroupBy } from './api'

function dateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString()
  const from = new Date(now)
  if (preset === '7d') from.setDate(from.getDate() - 7)
  else if (preset === '30d') from.setDate(from.getDate() - 30)
  else if (preset === '90d') from.setDate(from.getDate() - 90)
  else if (preset === '1y') from.setFullYear(from.getFullYear() - 1)
  else from.setDate(from.getDate() - 7)
  return { from: from.toISOString(), to }
}

export function ReportsPage() {
  const [preset, setPreset] = useState('30d')
  const [groupBy, setGroupBy] = useState<GroupBy>('day')

  const range = useMemo(() => dateRange(preset), [preset])

  const { data: salesRows = [] } = useQuery({
    queryKey: ['report-sales', range.from, range.to, groupBy],
    queryFn: () => fetchSalesReport(range.from, range.to, groupBy),
  })

  const { data: dishSales = [] } = useQuery({
    queryKey: ['report-dish-sales'],
    queryFn: fetchDishSales,
  })

  const { data: tableSales = [] } = useQuery({
    queryKey: ['report-table-sales'],
    queryFn: fetchTableSales,
  })

  const totalNet = salesRows.reduce((s, r) => s + r.net, 0)
  const totalBills = salesRows.reduce((s, r) => s + r.bills, 0)
  const totalTax = salesRows.reduce((s, r) => s + r.tax, 0)
  const totalDiscount = salesRows.reduce((s, r) => s + r.discounts, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sales and reports</h1>
          <p className="text-sm text-muted-foreground">Revenue breakdown, dish performance, table utilisation.</p>
        </div>
        <div className="flex gap-2">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">By day</SelectItem>
              <SelectItem value="month">By month</SelectItem>
              <SelectItem value="year">By year</SelectItem>
              <SelectItem value="waiter">By waiter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="Net revenue" value={formatMoney(totalNet)} />
        <SummaryTile label="Bills" value={String(totalBills)} />
        <SummaryTile label="Tax collected" value={formatMoney(totalTax)} />
        <SummaryTile label="Discounts given" value={formatMoney(totalDiscount)} />
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="dishes">Dish sales</TabsTrigger>
          <TabsTrigger value="tables">Table sales</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-4">
          {/* Revenue trend chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue trend</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {salesRows.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="bucket"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(v: string) => v.length > 10 ? v.slice(5, 10) : v}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(v) => formatMoney(v).replace('.00', '')}
                    />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
                            <p className="font-medium text-foreground">{label}</p>
                            <p className="text-muted-foreground">Net: {formatMoney(payload[0].value as number)}</p>
                          </div>
                        ) : null
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      stroke={SEQUENTIAL}
                      strokeWidth={2}
                      dot={{ r: 3, fill: SEQUENTIAL, stroke: 'var(--card)', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Sales breakdown table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{groupBy === 'waiter' ? 'Waiter' : 'Period'}</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesRows.map((r) => (
                    <TableRow key={r.bucket}>
                      <TableCell className="font-medium">{r.bucket}</TableCell>
                      <TableCell className="text-right">{r.bills}</TableCell>
                      <TableCell className="text-right">{formatMoney(r.gross)}</TableCell>
                      <TableCell className="text-right">{formatMoney(r.discounts)}</TableCell>
                      <TableCell className="text-right">{formatMoney(r.tax)}</TableCell>
                      <TableCell className="text-right">{formatMoney(r.net)}</TableCell>
                    </TableRow>
                  ))}
                  {salesRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No data for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dishes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dish performance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    <TableHead className="text-right">Qty sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cancellations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dishSales.map((d) => (
                    <TableRow key={d.item_id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-right">{d.qty_sold}</TableCell>
                      <TableCell className="text-right">{formatMoney(d.revenue)}</TableCell>
                      <TableCell className="text-right">{d.cancellations}</TableCell>
                    </TableRow>
                  ))}
                  {dishSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No dish sales data yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Table utilisation</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg turnaround</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableSales.map((t) => (
                    <TableRow key={t.table_id}>
                      <TableCell className="font-medium">{t.table_name}</TableCell>
                      <TableCell className="text-right">{t.bills}</TableCell>
                      <TableCell className="text-right">{formatMoney(t.revenue)}</TableCell>
                      <TableCell className="text-right">{t.avg_turnaround_minutes} min</TableCell>
                    </TableRow>
                  ))}
                  {tableSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No table sales data yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data for this period.
    </div>
  )
}
