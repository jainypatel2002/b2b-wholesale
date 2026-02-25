export type CategoryNodeScope = {
    id: string
    category_id: string | null | undefined
}

const normalizeId = (value: string | null | undefined): string => (value ?? '').trim()

export function filterCategoryNodesForCategory<T extends CategoryNodeScope>(
    nodes: readonly T[],
    categoryId: string | null | undefined
): T[] {
    const normalizedCategoryId = normalizeId(categoryId)
    if (!normalizedCategoryId) return []
    return nodes.filter(node => normalizeId(node.category_id) === normalizedCategoryId)
}

export function isCategoryNodeInCategory(
    node: CategoryNodeScope | null | undefined,
    categoryId: string | null | undefined
): boolean {
    if (!node) return false
    const normalizedCategoryId = normalizeId(categoryId)
    if (!normalizedCategoryId) return false
    return normalizeId(node.category_id) === normalizedCategoryId
}
