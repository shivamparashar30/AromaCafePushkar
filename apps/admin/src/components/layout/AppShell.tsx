import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { profile, signOut } = useAuth()

  if (!profile) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
        Loading your profile…
      </div>
    )
  }

  return (
    <div className="flex min-h-svh">
      <Sidebar profile={profile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b px-6 py-3">
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
