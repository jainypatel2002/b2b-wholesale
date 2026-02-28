'use client'

import { useTheme } from '@/components/theme-provider'
import { Moon, Sun, Monitor } from 'lucide-react'

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()

    return (
        <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--surface-border))] bg-white/70 p-1 shadow-sm backdrop-blur-md dark:bg-black/40">
            <button
                onClick={() => setTheme('light')}
                aria-label="Set light theme"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${theme === 'light' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
                <Sun className="h-4 w-4" />
            </button>

            <button
                onClick={() => setTheme('system')}
                aria-label="Set system theme"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${theme === 'system' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
                <Monitor className="h-4 w-4" />
            </button>

            <button
                onClick={() => setTheme('dark')}
                aria-label="Set dark theme"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${theme === 'dark' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
                <Moon className="h-4 w-4" />
            </button>
        </div>
    )
}
