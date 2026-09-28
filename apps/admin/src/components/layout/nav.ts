import type { AppRole } from '@/features/auth/AuthProvider'

export interface NavItem {
  to: string
  label: string
  /** Roles that see this item. Admin-dashboard sessions are always super_admin/manager/cashier
   * (waiter/kitchen have no email+password credential), so this only ever needs to gate among those three. */
  roles: AppRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/tables', label: 'Table structure', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/menu', label: 'Menu management', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/qr', label: 'QR code generator', roles: ['super_admin', 'manager'] },
  { to: '/live', label: 'Live table ordering', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/bookings', label: 'Bookings overview', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/bills', label: 'Bills', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/reports', label: 'Sales and reports', roles: ['super_admin', 'manager', 'cashier'] },
  { to: '/employees', label: 'Employee management', roles: ['super_admin', 'manager'] },
  { to: '/customers', label: 'Customers', roles: ['super_admin', 'manager'] },
  { to: '/settings', label: 'Settings', roles: ['super_admin'] },
]
