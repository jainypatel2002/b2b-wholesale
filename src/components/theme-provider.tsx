'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Theme = 'light' | 'dark' | 'system'

interface ThemeProviderState {
    theme: Theme
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
    children,
    defaultTheme = 'system',
}: {
    children: React.ReactNode
    defaultTheme?: Theme
}) {
    const [theme, setThemeState] = useState<Theme>(defaultTheme)
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

    useEffect(() => {
        // Read initial theme preference from localStorage on mount
        const savedTheme = localStorage.getItem('theme') as Theme | null
        if (savedTheme) {
            setThemeState(savedTheme)
        }

        // Check if we also have an authenticated user so we can sync from DB on first load?
        // User requested: If DB has a value and localStorage doesn’t: use DB value.
        // If localStorage has value: prefer localStorage, then sync to DB.
        const fetchProfileTheme = async () => {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('theme_preference')
                    .eq('id', session.user.id)
                    .single()

                if (profile?.theme_preference) {
                    if (!savedTheme) {
                        // No local preference, use DB
                        setTheme(profile.theme_preference as Theme)
                    } else if (savedTheme !== profile.theme_preference) {
                        // Local preference wins, so we sync it back to DB
                        syncThemeToDb(savedTheme)
                    }
                }
            }
        }
        fetchProfileTheme()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const syncThemeToDb = async (newTheme: Theme) => {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            await supabase
                .from('profiles')
                .update({ theme_preference: newTheme })
                .eq('id', session.user.id)
        }
    }

    const applyThemeClasses = useCallback((t: Theme) => {
        const root = document.documentElement
        root.classList.remove('light', 'dark')

        let resolved: 'light' | 'dark' = 'light'
        if (t === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            resolved = systemTheme
            root.classList.add(systemTheme)
        } else {
            resolved = t
            root.classList.add(t)
        }
        setResolvedTheme(resolved)
    }, [])

    useEffect(() => {
        applyThemeClasses(theme)
    }, [theme, applyThemeClasses])

    // Listen for system theme changes if we are on 'system' mode
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleChange = () => {
            if (theme === 'system') {
                applyThemeClasses('system')
            }
        }
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [theme, applyThemeClasses])

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
        localStorage.setItem('theme', newTheme)
        applyThemeClasses(newTheme)

        // Sync to DB
        syncThemeToDb(newTheme)
    }

    return (
        <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
