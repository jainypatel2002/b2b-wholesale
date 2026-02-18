import { Button } from "@/components/ui/button"

interface HeaderProps {
    email: string
    role: string
}

export function Header({ email, role }: HeaderProps) {
    return (
        <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-6">
            <div className="ml-auto flex items-center gap-4">
                <div className="text-right">
                    <div className="text-sm font-medium text-slate-900">{email}</div>
                    <div className="text-xs text-slate-500 capitalize">{role}</div>
                </div>
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                    {email[0].toUpperCase()}
                </div>
            </div>
        </header>
    )
}
