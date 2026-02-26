export interface Product {
    id: string
    distributor_id: string
    category_id: string | null
    name: string
    sku: string | null
    cost_price: number | null
    sell_price: number | null
    stock_qty: number | null // Legacy support
    stock_pieces: number // Canonical inventory
    allow_case: boolean
    allow_piece: boolean
    units_per_case: number | null
    low_stock_threshold: number
    barcode?: string | null
    barcodes?: ProductBarcode[]
    barcode_symbology?: string | null
    active: boolean
    created_at: string
    categories?: { name: string } | null
}

export interface ProductBarcode {
    id: string
    product_id?: string
    distributor_id?: string
    barcode: string
    is_primary: boolean
    created_at?: string
}

export type OrderUnit = 'piece' | 'case'

export interface CartItem {
    product_id: string
    name: string
    unit_price: number
    qty: number
    order_unit: OrderUnit
    units_per_case?: number | null
}
