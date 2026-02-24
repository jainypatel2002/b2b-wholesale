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
    createCategoryNode,
    updateCategoryNode,
    deleteCategoryNode
} from './actions'
import { toast } from 'sonner'

export type CategoryNode = {
    id: string
    category_id: string
    parent_id: string | null
    name: string
    created_at: string
    children: CategoryNode[]
}

export type Category = {
    id: string
    name: string
    created_at: string
    nodes: CategoryNode[]
}

export function CategoriesClient({ categories }: { categories: Category[] }) {
    const [isCreating, setIsCreating] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)

    async function handleCreate(formData: FormData) {
        setIsCreating(true)
        try {
            const res = await createCategory(formData)
            if (res && !res.ok) {
                toast.error(res.error)
            } else {
                toast.success('Category created successfully')
                formRef.current?.reset()
            }
        } catch (e: any) {
            toast.error(e.message)
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
    const [isAddingNode, setIsAddingNode] = useState(false)
    const nodeFormRef = useRef<HTMLFormElement>(null)

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
            const res = await updateCategory(category.id, formData)
            if (res && !res.ok) {
                toast.error(res.error)
            } else {
                toast.success('Category updated')
                setIsEditing(false)
            }
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const res = await deleteCategory(category.id)
            if (res && !res.ok) {
                toast.error(res.error)
                setIsDeleting(false)
            } else {
                toast.success('Category deleted')
            }
        } catch (e: any) {
            toast.error(e.message)
            setIsDeleting(false)
        }
    }

    const handleAddNode = async (formData: FormData) => {
        setIsAddingNode(true)
        try {
            const res = await createCategoryNode(formData)
            if (res && !res.ok) {
                toast.error(res.error)
                setIsAddingNode(false)
            } else {
                toast.success('Added subcategory')
                nodeFormRef.current?.reset()
                setIsAddingNode(false)
            }
        } catch (e: any) {
            toast.error(e.message)
            setIsAddingNode(false)
        }
    }

    return (
        <div className="border border-slate-100 rounded-lg bg-slate-50 overflow-hidden shadow-sm">
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
                            warningMessage={category.nodes?.length > 0 ? "Cannot delete: has subcategories." : undefined}
                        />
                    </div>
                )}
            </div>

            {expanded && (
                <div className="border-t border-slate-100 bg-white p-3 space-y-3">
                    {/* Recursive Nodes Tree */}
                    <div className="space-y-1">
                        {category.nodes?.map(node => (
                            <CategoryNodeItem key={node.id} node={node} categoryId={category.id} depth={0} />
                        ))}
                        {category.nodes?.length === 0 && (
                            <div className="text-xs text-slate-400 italic py-1 pl-6">No subcategories</div>
                        )}
                    </div>

                    {/* Add Base Node */}
                    {isAddingNode ? (
                        <form ref={nodeFormRef} action={handleAddNode} className="flex gap-2 items-center mt-2 pl-6 animate-in fade-in slide-in-from-top-1">
                            <input type="hidden" name="category_id" value={category.id} />
                            {/* parent_id intentionally omitted here to attach to root category */}
                            <CornerDownRight className="h-4 w-4 text-slate-300" />
                            <Input name="name" placeholder="New Subcategory" className="h-8 text-sm" autoFocus required />
                            <Button type="submit" size="sm" className="h-8">Save</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setIsAddingNode(false)}>Cancel</Button>
                        </form>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 pl-6 text-xs text-slate-500 hover:text-primary"
                            onClick={() => setIsAddingNode(true)}
                        >
                            <Plus className="mr-1 h-3 w-3" /> Add Subcategory
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

function CategoryNodeItem({ node, categoryId, depth }: { node: CategoryNode, categoryId: string, depth: number }) {
    const [expanded, setExpanded] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(node.name)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isAddingChild, setIsAddingChild] = useState(false)
    const childFormRef = useRef<HTMLFormElement>(null)

    useEffect(() => {
        setEditName(node.name)
        setIsEditing(false)
    }, [node.name])

    const handleSave = async () => {
        if (!editName.trim() || editName === node.name) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            const formData = new FormData()
            formData.append('name', editName)
            const res = await updateCategoryNode(node.id, formData)
            if (res && !res.ok) {
                toast.error(res.error)
            } else {
                toast.success('Updated')
                setIsEditing(false)
            }
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const res = await deleteCategoryNode(node.id)
            if (res && !res.ok) {
                toast.error(res.error)
                setIsDeleting(false)
            } else {
                toast.success('Deleted')
            }
        } catch (e: any) {
            toast.error(e.message)
            setIsDeleting(false)
        }
    }

    const handleAddChild = async (formData: FormData) => {
        setIsAddingChild(true)
        try {
            const res = await createCategoryNode(formData)
            if (res && !res.ok) {
                toast.error(res.error)
                setIsAddingChild(false)
            } else {
                toast.success('Added nested subcategory')
                childFormRef.current?.reset()
                setIsAddingChild(false)
                setExpanded(true) // Ensure it's open to see the new addition
            }
        } catch (e: any) {
            toast.error(e.message)
            setIsAddingChild(false)
        }
    }

    const paddingLeft = depth * 16

    return (
        <div className="w-full">
            {/* The Node Row */}
            <div
                className={`flex items-center justify-between group py-1 hover:bg-slate-50 rounded pl-6 pr-2 transition-colors`}
                style={{ marginLeft: `${paddingLeft}px` }}
            >
                <div className="flex items-center gap-2 flex-1">
                    {/* Expand/Collapse Toggle for Children */}
                    {node.children && node.children.length > 0 ? (
                        <div
                            className="cursor-pointer p-0.5 hover:bg-slate-200 rounded"
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                        </div>
                    ) : (
                        <CornerDownRight className="h-3 w-3 text-slate-300 ml-1" />
                    )}

                    {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-7 text-sm max-w-[200px]"
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
                    ) : (
                        <span className="text-sm text-slate-700 font-medium cursor-pointer" onClick={() => setExpanded(!expanded)}>
                            {node.name}
                        </span>
                    )}
                </div>

                {!isEditing && (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-slate-400 hover:text-blue-500"
                            onClick={() => setIsAddingChild(true)}
                            title="Add sub-category inside this one"
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-slate-400 hover:text-slate-700 mx-1"
                            onClick={() => setIsEditing(true)}
                        >
                            <Edit2 className="h-3 w-3" />
                        </Button>
                        <DeleteConfirmation
                            onConfirm={handleDelete}
                            isDeleting={isDeleting}
                            itemName={node.name}
                            className="h-6 w-6"
                            iconSize="h-3 w-3"
                        />
                    </div>
                )}
            </div>

            {/* Recursively Render Children AND Add Child Form if expanded or adding */}
            {(expanded || isAddingChild) && (
                <div className="space-y-1 mt-1">
                    {expanded && node.children.map(child => (
                        <CategoryNodeItem key={child.id} node={child} categoryId={categoryId} depth={depth + 1} />
                    ))}

                    {isAddingChild && (
                        <form
                            ref={childFormRef}
                            action={handleAddChild}
                            className="flex gap-2 items-center mt-1 animate-in fade-in slide-in-from-top-1"
                            style={{ marginLeft: `${paddingLeft + 16}px` }}
                        >
                            <input type="hidden" name="category_id" value={categoryId} />
                            <input type="hidden" name="parent_id" value={node.id} />
                            <CornerDownRight className="h-3 w-3 text-slate-300 ml-1" />
                            <Input name="name" placeholder={`New Subcategory in ${node.name}`} className="h-7 text-xs flex-1 max-w-[200px]" autoFocus required />
                            <Button type="submit" size="sm" className="h-7 text-xs px-2">Save</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setIsAddingChild(false)}>Cancel</Button>
                        </form>
                    )}
                </div>
            )}
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
