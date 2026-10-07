import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import type { SessionDetail } from './api'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ordered: 'secondary',
  cooking: 'default',
  ready: 'default',
  served: 'outline',
  cancelled: 'destructive',
}

export function OrderList({
  orders,
  canCancel,
  onCancelItem,
  onServeItem,
}: {
  orders: SessionDetail['orders']
  canCancel: boolean
  onCancelItem: (itemId: string) => void
  onServeItem: (itemId: string) => void
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">No orders on this table yet.</p>
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order.id} className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs">
            <span className="font-medium">KOT #{order.kot_number}</span>
            <span className="text-muted-foreground">
              {order.source === 'customer' ? `Customer: ${order.placed_by_name || 'Guest'}` : order.placed_by_name ?? order.source} · {new Date(order.created_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="divide-y">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className={item.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                    {item.qty}× {item.item_name}
                    {item.variant_name ? ` (${item.variant_name})` : ''}
                  </p>
                  {item.addon_names.length > 0 && (
                    <p className="text-xs text-muted-foreground">+ {item.addon_names.join(', ')}</p>
                  )}
                  {item.notes && <p className="text-xs text-muted-foreground">"{item.notes}"</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(item.unit_price * item.qty)}
                  </span>
                  <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                  {item.status === 'ready' && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => onServeItem(item.id)}
                    >
                      Serve
                    </Button>
                  )}
                  {canCancel && !['cancelled', 'served', 'wasted'].includes(item.status) && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-destructive"
                      onClick={() => onCancelItem(item.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
