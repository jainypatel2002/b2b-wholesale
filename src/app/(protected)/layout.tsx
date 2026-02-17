import { requireProfile } from '@/lib/auth'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()

  return (
    <div>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div>
            <div className="text-sm text-slate-500">Signed in as</div>
            <div className="font-medium">{profile.email ?? profile.id}</div>
            <div className="text-xs text-slate-500">Role: {profile.role}</div>
          </div>
          <form action="/logout" method="post">
            <button className="btn" type="submit">Logout</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  )
}
