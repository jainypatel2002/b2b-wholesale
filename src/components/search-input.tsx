'use client'

import { useState, useEffect } from 'react'

interface SearchInputProps {
    onSearch: (term: string) => void
    placeholder?: string
    className?: string
}

export function SearchInput({ onSearch, placeholder = 'Search...', className = '' }: SearchInputProps) {
    const [value, setValue] = useState('')

    useEffect(() => {
        const handler = setTimeout(() => {
            onSearch(value)
        }, 300) // 300ms debounce

        return () => clearTimeout(handler)
    }, [value, onSearch])

    return (
        <div className={`relative ${className}`}>
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </span>
            <input
                type="text"
                className="input pl-10 w-full"
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
            />
        </div>
    )
}
