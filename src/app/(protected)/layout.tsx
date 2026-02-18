import { requireProfile } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent">
      {/* Sidebar - glass effect or blended */}
      <aside className="hidden w-64 flex-col border-r border-slate-200/60 bg-white/80 backdrop-blur-xl md:flex print:hidden z-20">
        <Sidebar role={profile.role as 'distributor' | 'vendor'} />
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Sticky Header with Glass Effect */}
        <header className="sticky top-0 z-10 w-full border-b border-slate-200/60 bg-white/70 backdrop-blur-xl print:hidden">
          <div className="px-4 md:px-6 py-3">
            <Header email={profile.email || ''} role={profile.role} />
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 print:max-w-none print:p-0 scroll-smooth">
          <div className="mx-auto max-w-7xl space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
