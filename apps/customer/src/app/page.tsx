'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

export default function HomePage() {
  // The outlet's name lives in the database; nothing here hard-codes the restaurant.
  const [outletName, setOutletName] = useState('')

  useEffect(() => {
    supabase
      .rpc('public_outlet_info')
      .then(({ data }) => setOutletName(data?.[0]?.name ?? ''))
  }, [])

  return (
    <main className={styles.main}>
      <div className={styles.logo}>☕</div>
      <h1 className={styles.title}>{outletName || ' '}</h1>
      <p className={styles.subtitle}>
        Scan the QR code on your table to browse the menu and place your order.
      </p>
    </main>
  )
}
