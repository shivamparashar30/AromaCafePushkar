// Every money column in the DB is stored in paise (bigint) to avoid rounding errors -- this is the
// one place that turns that back into a ₹ display string.

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

export function formatMoney(paise: number | string | null | undefined): string {
  const value = Number(paise ?? 0) / 100
  return formatter.format(value)
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}
