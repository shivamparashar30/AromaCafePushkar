import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav'
import type { StaffProfile } from '@/features/auth/AuthProvider'

const ROLE_LABEL: Record<StaffProfile['role'], string> = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
}

export function Sidebar({ profile }: { profile: StaffProfile }) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(profile.role))

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="border-b px-4 py-4">
        <p className="font-semibold leading-tight">Spice Route Kitchen</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3">
        <p className="truncate text-sm font-medium">{profile.name}</p>
        <p className="truncate text-xs text-muted-foreground">{profile.phone}</p>
      </div>
    </aside>
  )
}
