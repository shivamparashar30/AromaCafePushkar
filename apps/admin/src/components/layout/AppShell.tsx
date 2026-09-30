import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!profile) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
        Loading your profile…
      </div>
    )
  }

  return (
    // Exactly one viewport tall with overflow clipped, so the only thing that scrolls is
    // <main>. With min-h-svh the document itself grew and carried the sidebar and header
    // up with it, which is why the nav slid away on long pages.
    <div className="flex h-svh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar profile={profile} onNavigate={() => {}} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] animate-in slide-in-from-left duration-200">
            <Sidebar profile={profile} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b bg-[#FFF7F2] px-3 py-2.5 sm:px-6 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Hamburger button — mobile only */}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8713A] text-white text-sm font-bold">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-foreground leading-tight">{profile.name}</p>
              <p className="text-xs text-muted-foreground">{profile.phone}</p>
            </div>
            <p className="text-sm font-semibold text-foreground sm:hidden">{profile.name.split(' ')[0]}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="text-muted-foreground">
            Sign out
          </Button>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
