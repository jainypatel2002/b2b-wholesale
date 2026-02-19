'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ShoppingCart, AlertTriangle } from 'lucide-react'
import { CategoryCard } from '@/components/vendor/category-card'

interface CategoriesClientProps {
    categories: any[]
}

export function CategoriesClient({ categories }: CategoriesClientProps) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredCategories = useMemo(() => {
        if (!searchTerm.trim()) return categories
        const lower = searchTerm.toLowerCase()
        return categories.filter(c =>
            c.name.toLowerCase().includes(lower)
        )
    }, [categories, searchTerm])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                {/* Search & Cart Bar */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            type="search"
                            placeholder="Search categories..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Link href="/vendor/cart">
                        <Button variant="outline" className="w-full sm:w-auto relative">
                            <ShoppingCart className="mr-2 h-4 w-4" /> Go to Cart
                        </Button>
                    </Link>
                </div>

                {/* Results Count */}
                <div className="text-xs text-slate-500 font-medium px-1">
                    Showing {filteredCategories.length} categories
                </div>
            </div>

            {filteredCategories.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No categories match your search.</p>
                    <Button
                        variant="link"
                        onClick={() => setSearchTerm('')}
                        className="mt-2 text-blue-600"
                    >
                        Clear search
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCategories.map((c) => (
                        <CategoryCard key={c.id} category={c} />
                    ))}
                </div>
            )}
        </div>
    )
}
