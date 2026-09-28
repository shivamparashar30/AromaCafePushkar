import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { BillsPage } from '@/features/bills/BillsPage'
import { BookingsPage } from '@/features/bookings/BookingsPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { EmployeesPage } from '@/features/employees/EmployeesPage'
import { LiveOrdersPage } from '@/features/live-orders/LiveOrdersPage'
import { MenuPage } from '@/features/menu/MenuPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { QrPage } from '@/features/qr/QrPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TablesPage } from '@/features/tables/TablesPage'
import { queryClient } from '@/lib/queryClient'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AuthGuard />}>
              <Route element={<AppShell />}>
                <Route index element={<OverviewPage />} />
                <Route path="tables" element={<TablesPage />} />
                <Route path="menu" element={<MenuPage />} />
                <Route path="qr" element={<QrPage />} />
                <Route path="live" element={<LiveOrdersPage />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="employees" element={<EmployeesPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}
