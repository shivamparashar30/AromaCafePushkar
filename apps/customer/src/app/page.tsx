import styles from './page.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Welcome</h1>
      <p className={styles.subtitle}>
        Scan the QR code on your table to browse the menu and place your order.
      </p>
    </main>
  )
}
