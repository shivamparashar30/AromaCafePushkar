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

export function Sidebar({ profile, onNavigate }: { profile: StaffProfile; onNavigate: () => void }) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(profile.role))

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="border-b bg-[#FFF7F2] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8713A] shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" x2="6" y1="2" y2="4" />
              <line x1="10" x2="10" y1="2" y2="4" />
              <line x1="14" x2="14" y1="2" y2="4" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[15px] leading-tight text-foreground">Aroma Cafe</p>
            <p className="text-xs text-[#E8713A] font-medium tracking-wide">PUSHKAR</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-white/70 px-3 py-1.5 text-xs text-muted-foreground">
          {ROLE_LABEL[profile.role]} Dashboard
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 pt-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'block rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-[#FFF0E8] text-[#E8713A] font-semibold'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
