import { getEffectivePrice, computeLineTotal, normalizeInvoiceItem, ProductPricing } from './src/lib/pricing-engine'

// Test getEffectivePrice

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message)
    }
}

console.log("Testing getEffectivePrice...")

const productBaseOnly: ProductPricing = {
    sell_price: 10,
    price_case: 100,
    units_per_case: 12
}

assert(getEffectivePrice(productBaseOnly, 'piece') === 10, "Base Piece math failed")
assert(getEffectivePrice(productBaseOnly, 'case') === 100, "Base Case math failed")

const productUnitOverride: ProductPricing = {
    sell_price: 10,
    override_unit_price: 8,
    units_per_case: 10
}
assert(getEffectivePrice(productUnitOverride, 'piece') === 8, "Unit override failed")
assert(getEffectivePrice(productUnitOverride, 'case') === 80, "Case derived from unit override failed")

const productCaseOverride: ProductPricing = {
    sell_price: 2,
    override_case_price: 36,
    units_per_case: 24
}
// Piece should be 36 / 24 = 1.5
assert(getEffectivePrice(productCaseOverride, 'piece') === 1.5, "Piece derived from case override failed")
assert(getEffectivePrice(productCaseOverride, 'case') === 36, "Case override failed")

console.log("getEffectivePrice passed.")

console.log("Testing computeLineTotal...")
assert(computeLineTotal(3, 10.555) === 31.67, "Rounding failed")
assert(computeLineTotal(0, 10.55) === 0, "Zero qty failed")
console.log("computeLineTotal passed.")


console.log("Testing normalizeInvoiceItem...")
const item1 = {
    id: "123",
    product_name: "Test",
    qty: 5,
    order_unit: "piece",
    unit_price: 5.5,
    units_per_case: 10
}
const norm1 = normalizeInvoiceItem(item1)
assert(norm1.lineTotal === 27.5, "Line total compute failed")
assert(norm1.casePrice === 55, "Derived case price failed")

const item2Case = {
    id: "456",
    product_name: "Case Test",
    qty: 2,
    order_unit: "case",
    unit_price: 100, // Legacy row where unit_price stored case_price
    units_per_case: 10
}
const norm2 = normalizeInvoiceItem(item2Case)
// Because order_unit=case and case_price was not explicitly snapshotted, casePrice inherits unit_price = 100
assert(norm2.casePrice === 100, "Legacy case inheritance failed")
assert(norm2.lineTotal === 200, "Case line total failed")
assert(norm2.unitPrice === 10, "Derived legacy piece failed")

// Exact snapshots
const itemSnapshot = {
    id: "789",
    product_name: "Snap Test",
    qty: 3,
    quantity_snapshot: 5,
    order_unit: "piece",
    unit_price: 5,
    unit_price_snapshot: 10,
    ext_amount: 40,
    line_total_snapshot: 40
}
const norm3 = normalizeInvoiceItem(itemSnapshot)
assert(norm3.lineTotal === 40, "Snapshot line total failed (absolute truth priority)")
assert(norm3.qty === 5, "Snapshot qty priority failed")
assert(norm3.unitPrice === 10, "Snapshot unit price priority failed")

console.log("normalizeInvoiceItem passed.")
console.log("ALL TESTS PASSED.")
