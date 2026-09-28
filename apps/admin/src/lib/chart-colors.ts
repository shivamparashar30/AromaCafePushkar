// Slot order matches the dataviz skill's validated categorical palette (references/palette.md).
// Referenced as CSS custom properties (defined in index.css, light + dark) so charts pick up the
// right values automatically; slot 1 (blue) doubles as the single-hue "sequential" color for
// magnitude-only charts (sales by hour, 7-day trend, top dishes).
export const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const

export const SEQUENTIAL = 'var(--chart-1)'

export const STATUS = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
} as const
