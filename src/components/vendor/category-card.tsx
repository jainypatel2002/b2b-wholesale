'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, Package, Box } from 'lucide-react'
import Link from 'next/link'

interface CategoryCardProps {
    category: {
        id: string
        name: string
        product_count?: number
        subcategories?: { id: string, name: string }[]
    }
}

export function CategoryCard({ category }: CategoryCardProps) {
    return (
        <Link href={`/vendor/catalog/${category.id}`}>
            <Card className="group h-full cursor-pointer border-white/75 bg-white/80 transition-all">
                <CardContent className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-primary transition-colors group-hover:bg-sky-100">
                            <Box className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 transition-colors group-hover:text-primary">
                                {category.name}
                            </h3>
                            {category.product_count !== undefined && (
                                <p className="text-sm text-slate-500">
                                    {category.product_count} products
                                </p>
                            )}
                        </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-primary" />
                </CardContent>
            </Card>
        </Link>
    )
}
