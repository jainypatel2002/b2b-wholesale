You are working inside my existing Distributor–Vendor Portal codebase (Supabase + current UI). Implement a SAFE, PERMANENT “Lock Stock Quantity” feature for Distributors ONLY.

========================
STRICT IMPLEMENTATION RULES (NON-NEGOTIABLE)
========================
1) DO NOT break any existing features: auth, distributor/vendor roles, catalog browsing, ordering, order fulfillment, invoices, inventory add/edit, search, filters.
2) DO NOT remove or rename existing DB columns, routes, or components unless you update ALL references.
3) DO NOT delete any data. No wiping inventory. No overwriting prices.
4) Tenant safe: all actions scoped to the current distributor_id. Never cross-distributor reads/writes.
5) Respect Supabase RLS. DO NOT disable RLS. If blocked, implement correct secure policy updates.
6) No duplicates, no inconsistent state: every inventory product must have predictable stock behavior.
7) All code must build clean (TypeScript). No console spam. No “temporary fix”.
8) If anything is ambiguous in schema, DO NOT guess: inspect existing inventory table and existing stock deduction logic first, then implement.
9) Add clear UI feedback + error messages for lock/unlock actions.
10) Provide: files changed, SQL migration, and a full test plan.

========================
FEATURE GOAL
========================
Distributors can “LOCK” a product’s stock quantity to a specific number.
If a product is locked, then:
- Vendor orders and distributor fulfillment MUST NOT reduce that product’s stock (quantity stays unchanged).
If a product is NOT locked, existing behavior remains (stock deducts as it currently does).

This must work for:
A) New inventory products (option to lock while adding)
B) Existing inventory products (toggle lock + set locked stock value)
C) Order fulfillment process (the deduction step must respect lock)

========================
EXPECTED BEHAVIOR (EXACT RULES)
========================
Inventory product has:
- quantity_on_hand (existing stock field)  ← keep using existing field name in my codebase
- stock_locked (boolean)
- locked_stock_qty (integer or numeric)   // the “locked number” user sets

Rules:
1) If stock_locked = true:
   - quantity_on_hand should be forced to locked_stock_qty (or remain exactly locked_stock_qty)
   - On order fulfillment: DO NOT deduct quantity_on_hand for that product
   - If distributor edits locked_stock_qty, quantity_on_hand updates to match it immediately
2) If stock_locked = false:
   - quantity_on_hand behaves normally (deduct on fulfillment exactly as it currently does)
3) Lock/unlock should be reversible:
   - Locking sets stock_locked = true and requires locked_stock_qty
   - Unlocking sets stock_locked = false (locked_stock_qty may remain stored but ignored)
4) Prevent negative stock:
   - For unlocked products, keep existing validation
   - For locked products, ignore deduction validation since no deduction occurs

========================
DATABASE CHANGES (SAFE MIGRATION)
========================
1) Add columns to inventory table (or equivalent inventory_products table):
- stock_locked boolean NOT NULL DEFAULT false
- locked_stock_qty numeric/integer NULL

2) Add a CHECK constraint (optional but recommended):
- locked_stock_qty must be NULL when stock_locked = false OR allow storing but validate on save:
  - if stock_locked = true then locked_stock_qty is NOT NULL and locked_stock_qty >= 0

3) Add indexes (if needed):
- (distributor_id, stock_locked)

DO NOT change any existing column types.

========================
UI CHANGES (DISTRIBUTOR ONLY)
========================
1) Inventory “Add Product” form:
- Add a toggle: “Lock stock”
- If enabled: show input “Locked stock quantity”
- When saved:
  - store stock_locked + locked_stock_qty
  - set quantity_on_hand = locked_stock_qty
  - leave price fields unchanged from current behavior

2) Inventory “Edit Product” (existing product):
- Add a section:
  - Toggle: “Stock Locked”
  - Input: “Locked stock quantity” (only visible if locked)
  - Save button updates fields
  - If locked: also update quantity_on_hand to equal locked_stock_qty

3) Inventory list table/card:
- Show a small badge/icon “Locked”
- Optionally show locked quantity value

========================
ORDER / FULFILLMENT LOGIC (CRITICAL)
========================
Find where stock is currently deducted (likely during “fulfill order”, “generate invoice”, or “mark fulfilled”).
Modify deduction logic as follows:

For each order item:
- Fetch corresponding inventory product row for current distributor
- If stock_locked = true:
    skip deduction for this item
  else:
    apply the current deduction logic (do not change formulas)

This MUST be done safely and atomically:
- Use a single RPC / transaction if possible so partial updates don’t happen.
- Ensure race-condition safety (2 fulfillments at once):
  - For unlocked items: use SQL update with checks or a transaction.
  - For locked items: no update needed.

========================
SECURITY / RLS
========================
- Distributors can update stock_locked and locked_stock_qty for their inventory rows.
- Vendors must NOT be able to modify these fields.
- Vendor reads should remain unchanged (they might see quantity_on_hand already — keep current behavior).

========================
EDGE CASES
========================
1) If stock is locked and locked_stock_qty is NULL:
- Block saving and show validation error (UI + server-side).
2) If an existing product is locked but has quantity_on_hand different from locked_stock_qty:
- Auto-correct on next save OR add a small “Fix now” action. Prefer auto-correct on save.
3) If an order is placed for a locked product:
- It should be allowed if current app allows ordering based on stock; do not block.
- Fulfillment will not reduce stock.

========================
DELIVERABLES
========================
1) Show the exact files you changed (paths).
2) Provide SQL migration code for the inventory table changes.
3) Provide the updated fulfillment/deduction implementation (with comments explaining locked logic).
4) Provide a test plan:
   - Create product locked=on qty=50 → inventory shows 50
   - Vendor orders 5 → fulfill → stock remains 50
   - Unlock product → vendor orders 5 → fulfill → stock becomes 45
   - Lock existing product with qty=20 → stock becomes 20 and stays 20 after fulfillment
   - Multi-vendor/distributor safety test

START NOW:
- Inspect current inventory schema and where fulfillment deduction happens.
- Implement DB migration, then UI toggles, then deduction logic update.
- Ensure no regressions and build passes.








