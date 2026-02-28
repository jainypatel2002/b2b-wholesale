import { calcMargin } from '@/lib/analytics/calc'
import type { ProductProfitability } from '@/lib/analytics/profit'
import type { CategorySalesMix, ItemSalesMix } from '@/lib/analytics/salesMix'

export type CategoryProfitability = {
  categoryId: string | null
  categoryName: string
  revenue: number
  cost: number
  profit: number
  margin: number
  productCount: number
}

function toCategoryKey(categoryId: string | null | undefined) {
  return categoryId ?? 'uncategorized'
}

export function buildCategoryProfitability({
  products,
  items,
  categories
}: {
  products: ProductProfitability[]
  items: (ItemSalesMix & { categoryId: string | null })[]
  categories: CategorySalesMix[]
}): CategoryProfitability[] {
  const categoryNameByKey = new Map<string, string>()
  for (const category of categories) {
    categoryNameByKey.set(toCategoryKey(category.categoryId), category.categoryName || 'Uncategorized')
  }

  const categoryByProductId = new Map<string, { categoryId: string | null; categoryKey: string }>()
  for (const item of items) {
    categoryByProductId.set(item.productId, {
      categoryId: item.categoryId ?? null,
      categoryKey: toCategoryKey(item.categoryId)
    })
  }

  const aggregated = new Map<string, CategoryProfitability>()

  for (const product of products) {
    const productCategory = categoryByProductId.get(product.productId)
    const categoryKey = productCategory?.categoryKey ?? 'uncategorized'
    const categoryId = productCategory?.categoryId ?? null
    const categoryName = categoryNameByKey.get(categoryKey) || 'Uncategorized'

    const row = aggregated.get(categoryKey) || {
      categoryId,
      categoryName,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      productCount: 0
    }

    row.revenue += product.revenue
    row.cost += product.cost
    row.profit += product.profit
    row.productCount += 1

    aggregated.set(categoryKey, row)
  }

  return Array.from(aggregated.values())
    .map((row) => ({
      ...row,
      margin: calcMargin(row.profit, row.revenue)
    }))
    .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue || a.categoryName.localeCompare(b.categoryName))
}
