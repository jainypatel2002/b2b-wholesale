
'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Folder, Trash2, ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react'
import { createCategory, deleteCategory, createSubcategory, deleteSubcategory } from './actions'
// import { toast } from 'sonner' 

type Category = {
    id: string
    name: string
    created_at: string
    subcategories: Subcategory[]
}

type Subcategory = {
    id: string
    name: string
    created_at: string
}

export function CategoriesClient({ categories }: { categories: Category[] }) {
    const [isDeleting, setIsDeleting] = useState<string | null>(null)

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Add Category Form */}
            <Card className="h-fit">
                <CardHeader>
                    <CardTitle>Add New Category</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={async (formData) => {
                        try {
                            await createCategory(formData)
                            // toast.success('Category added')
                        } catch (e) {
                            console.error(e)
                            // toast.error('Failed to add category')
                        }
                    }} className="flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium leading-none">Category Name</label>
                            <Input name="name" placeholder="Ex: Tobacco, Beverages..." required />
                        </div>
                        <Button type="submit">
                            <Plus className="mr-2 h-4 w-4" /> Add
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Categories List */}
            <Card>
                <CardHeader>
                    <CardTitle>Your Categories</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {categories.length ? (
                            categories.map((c) => (
                                <CategoryItem key={c.id} category={c} />
                            ))
                        ) : (
                            <div className="text-sm text-slate-500 italic py-4 text-center">No categories yet.</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function CategoryItem({ category }: { category: Category }) {
    const [expanded, setExpanded] = useState(false)
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
    const [isAddingSub, setIsAddingSub] = useState(false)

    const handleDelete = async () => {
        try {
            await deleteCategory(category.id)
        } catch (e) {
            alert('Failed to delete category')
        }
    }

    return (
        <div className="border border-slate-100 rounded-lg bg-slate-50 overflow-hidden">
            <div className="flex items-center justify-between p-3">
                <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <Folder className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">{category.name}</span>
                    <span className="text-xs text-slate-400">({category.subcategories?.length || 0})</span>
                </div>

                <div className="flex items-center gap-2">
                    {isConfirmingDelete ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600 font-medium">Sure?</span>
                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={handleDelete}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsConfirmingDelete(false)}>
                                ✕
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-500"
                            onClick={() => setIsConfirmingDelete(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-100 bg-white p-3 pl-8 space-y-3">
                    {/* Subcategories List */}
                    <div className="space-y-2">
                        {category.subcategories?.map(sub => (
                            <SubcategoryItem key={sub.id} subcategory={sub} />
                        ))}
                    </div>

                    {/* Add Subcategory */}
                    {isAddingSub ? (
                        <form action={async (formData) => {
                            try {
                                await createSubcategory(formData)
                                setIsAddingSub(false)
                            } catch (e) {
                                console.error(e)
                            }
                        }} className="flex gap-2 items-center mt-2">
                            <input type="hidden" name="category_id" value={category.id} />
                            <CornerDownRight className="h-4 w-4 text-slate-300" />
                            <Input name="name" placeholder="New Subcategory" className="h-8 text-sm" autoFocus required />
                            <Button type="submit" size="sm" className="h-8">Save</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setIsAddingSub(false)}>Cancel</Button>
                        </form>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-slate-500 hover:text-blue-600 pl-0"
                            onClick={() => setIsAddingSub(true)}
                        >
                            <Plus className="mr-1 h-3 w-3" /> Add Subcategory
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

function SubcategoryItem({ subcategory }: { subcategory: Subcategory }) {
    const [isConfirming, setIsConfirming] = useState(false)

    const handleDelete = async () => {
        try {
            await deleteSubcategory(subcategory.id)
        } catch (e) {
            alert('Failed to delete subcategory')
        }
    }

    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-2">
                <CornerDownRight className="h-3 w-3 text-slate-300" />
                <span className="text-sm text-slate-600">{subcategory.name}</span>
            </div>
            {isConfirming ? (
                <div className="flex items-center gap-1">
                    <button onClick={handleDelete} className="text-xs text-red-600 font-bold hover:underline">Confirm</button>
                    <button onClick={() => setIsConfirming(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
            ) : (
                <button
                    onClick={() => setIsConfirming(true)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}
        </div>
    )
}
