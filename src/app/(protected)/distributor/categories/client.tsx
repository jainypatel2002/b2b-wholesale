'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Folder, Trash2, ChevronRight, ChevronDown, CornerDownRight, Edit2, X, Check, Loader2 } from 'lucide-react'
import {
    createCategory,
    updateCategory,
    deleteCategory,
    createSubcategory,
    updateSubcategory,
    deleteSubcategory
} from './actions'
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
    const [isCreating, setIsCreating] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)

    async function handleCreate(formData: FormData) {
        setIsCreating(true)
        try {
            await createCategory(formData)
            formRef.current?.reset()
        } catch (e: any) {
            alert(e.message) // Replace with toast in real app
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Add Category Form */}
            <Card className="h-fit">
                <CardHeader>
                    <CardTitle>Add New Category</CardTitle>
                </CardHeader>
                <CardContent>
                    <form ref={formRef} action={handleCreate} className="flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium leading-none">Category Name</label>
                            <Input name="name" placeholder="Ex: Tobacco, Beverages..." required disabled={isCreating} />
                        </div>
                        <Button type="submit" disabled={isCreating}>
                            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Add
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
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(category.name)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isAddingSub, setIsAddingSub] = useState(false)
    const subFormRef = useRef<HTMLFormElement>(null)

    // Reset edit state when category changes
    useEffect(() => {
        setEditName(category.name)
        setIsEditing(false)
    }, [category.name])

    const handleSaveEdit = async () => {
        if (!editName.trim() || editName === category.name) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            const formData = new FormData()
            formData.append('name', editName)
            await updateCategory(category.id, formData)
            setIsEditing(false)
        } catch (e: any) {
            alert(e.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteCategory(category.id)
        } catch (e: any) {
            alert(e.message)
            setIsDeleting(false)
        }
    }

    const handleAddSub = async (formData: FormData) => {
        setIsAddingSub(true)
        try {
            await createSubcategory(formData)
            subFormRef.current?.reset()
            setIsAddingSub(false) // toggle back to button
        } catch (e: any) {
            alert(e.message)
            setIsAddingSub(false)
        }
    }

    return (
        <div className="border border-slate-100 rounded-lg bg-slate-50 overflow-hidden">
            <div className="flex items-center justify-between p-3 min-h-[52px]">
                {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                        <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') setIsEditing(false)
                            }}
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleSaveEdit} disabled={isSaving}>
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setIsEditing(false)} disabled={isSaving}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div
                        className="flex items-center gap-3 cursor-pointer flex-1 select-none"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <Folder className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">{category.name}</span>
                        <span className="text-xs text-slate-400">({category.subcategories?.length || 0})</span>
                    </div>
                )}

                {!isEditing && (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                            onClick={() => setIsEditing(true)}
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteConfirmation
                            onConfirm={handleDelete}
                            isDeleting={isDeleting}
                            itemName={category.name}
                            warningMessage={category.subcategories?.length > 0 ? "Cannot delete: has subcategories." : undefined}
                        />
                    </div>
                )}
            </div>

            {expanded && (
                <div className="border-t border-slate-100 bg-white p-3 pl-8 space-y-3">
                    {/* Subcategories List */}
                    <div className="space-y-1">
                        {category.subcategories?.map(sub => (
                            <SubcategoryItem key={sub.id} subcategory={sub} />
                        ))}
                        {category.subcategories?.length === 0 && (
                            <div className="text-xs text-slate-400 italic py-1">No subcategories</div>
                        )}
                    </div>

                    {/* Add Subcategory */}
                    {isAddingSub ? (
                        <form ref={subFormRef} action={handleAddSub} className="flex gap-2 items-center mt-2 animate-in fade-in slide-in-from-top-1">
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
                            className="text-xs text-slate-500 hover:text-blue-600 pl-0 mt-1"
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
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(subcategory.name)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        setEditName(subcategory.name)
        setIsEditing(false)
    }, [subcategory.name])

    const handleSave = async () => {
        if (!editName.trim() || editName === subcategory.name) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            const formData = new FormData()
            formData.append('name', editName)
            await updateSubcategory(subcategory.id, formData)
            setIsEditing(false)
        } catch (e: any) {
            alert(e.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteSubcategory(subcategory.id)
        } catch (e: any) {
            alert(e.message)
            setIsDeleting(false)
        }
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 py-1 pl-6">
                <CornerDownRight className="h-3 w-3 text-slate-300" />
                <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm flex-1 max-w-[200px]"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') setIsEditing(false)
                    }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={handleSave} disabled={isSaving}>
                    <Check className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    <X className="h-3 w-3" />
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between group py-1 hover:bg-slate-50 rounded pl-6 pr-2 -ml-6 mr-0 transition-colors">
            <div className="flex items-center gap-2">
                <CornerDownRight className="h-3 w-3 text-slate-300" />
                <span className="text-sm text-slate-600">{subcategory.name}</span>
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-slate-400 hover:text-slate-700"
                    onClick={() => setIsEditing(true)}
                >
                    <Edit2 className="h-3 w-3" />
                </Button>
                <DeleteConfirmation
                    onConfirm={handleDelete}
                    isDeleting={isDeleting}
                    itemName={subcategory.name}
                    className="h-6 w-6"
                    iconSize="h-3 w-3"
                />
            </div>
        </div>
    )
}

function DeleteConfirmation({
    onConfirm,
    isDeleting,
    itemName,
    warningMessage,
    className = "h-8 w-8",
    iconSize = "h-4 w-4"
}: {
    onConfirm: () => void,
    isDeleting: boolean,
    itemName: string,
    warningMessage?: string,
    className?: string,
    iconSize?: string
}) {
    const [isOpen, setIsOpen] = useState(false)

    if (isDeleting) {
        return <Loader2 className={`${iconSize} animate-spin text-slate-400 m-2`} />
    }

    if (isOpen) {
        return (
            <div className="flex items-center gap-1 animate-in fade-in zoom-in-50 duration-200">
                {warningMessage ? (
                    <span className="text-xs text-amber-600 font-medium mr-1">{warningMessage}</span>
                ) : (
                    <span className="text-xs text-red-600 font-medium mr-1">Delete?</span>
                )}

                {!warningMessage && (
                    <Button
                        size="icon"
                        variant="destructive"
                        className="h-6 w-6"
                        onClick={onConfirm}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                )}

                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setIsOpen(false)}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
        )
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className={`${className} text-slate-400 hover:text-red-500`}
            onClick={() => setIsOpen(true)}
        >
            <Trash2 className={iconSize} />
        </Button>
    )
}
