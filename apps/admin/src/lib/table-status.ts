export const TABLE_STATUS_STYLE: Record<string, string> = {
  free: 'bg-[var(--status-good)]/15 text-[var(--status-good)] border-[var(--status-good)]/30',
  occupied: 'bg-[var(--chart-1)]/15 text-[var(--chart-1)] border-[var(--chart-1)]/30',
  bill_requested: 'bg-[var(--status-warning)]/20 text-[#8a5a00] border-[var(--status-warning)]/40',
  paid: 'bg-[var(--chart-3)]/15 text-[var(--chart-3)] border-[var(--chart-3)]/30',
  reserved: 'bg-[var(--chart-7)]/15 text-[var(--chart-7)] border-[var(--chart-7)]/30',
}

export const TABLE_STATUS_LABEL: Record<string, string> = {
  free: 'Free',
  occupied: 'Occupied',
  bill_requested: 'Bill requested',
  paid: 'Paid',
  reserved: 'Reserved',
}
