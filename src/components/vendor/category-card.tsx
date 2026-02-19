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
            <Card className="h-full hover:shadow-md transition-all hover:border-blue-200 cursor-pointer group">
                <CardContent className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
                            <Box className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg text-slate-900 group-hover:text-blue-700 transition-colors">
                                {category.name}
                            </h3>
                            {category.product_count !== undefined && (
                                <p className="text-sm text-slate-500">
                                    {category.product_count} products
                                </p>
                            )}
                        </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </CardContent>
            </Card>
        </Link>
    )
}
