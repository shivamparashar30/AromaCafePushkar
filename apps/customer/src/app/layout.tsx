import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aroma Cafe Pushkar — Order from your table',
  description: 'Scan, browse the menu, and order from your phone.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
