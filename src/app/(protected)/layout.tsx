import { requireProfile } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { MobileDashboardButton } from '@/components/layout/mobile-dashboard-button'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const role = profile.role as 'distributor' | 'vendor'

  return (
    <div className="dashboard-shell flex h-dvh w-full overflow-hidden text-slate-900">
      <aside className="hidden w-72 shrink-0 border-r border-white/60 bg-white/60 backdrop-blur-xl md:flex print:hidden">
        <Sidebar role={role} />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pt-3 md:px-6 md:pt-5 print:hidden">
          <div className="glass rounded-2xl">
            <Header email={profile.email || ''} role={profile.role} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto px-3 pb-24 pt-3 md:px-6 md:pb-6 md:pt-4 print:p-0">
          <div className="mx-auto w-full max-w-7xl">
            <section className="dashboard-surface min-h-[calc(100vh-11.5rem)] p-4 md:p-6 lg:p-8 print:min-h-0 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
              <div className="space-y-6">{children}</div>
            </section>
          </div>
        </main>

        <MobileBottomNav role={role} />
        <MobileDashboardButton role={role} />
      </div>
    </div>
  )
}
