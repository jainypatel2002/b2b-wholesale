import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, type CreateOrderParams } from './create-order'

type TableName =
  | 'distributor_vendors'
  | 'products'
  | 'vendor_price_overrides'
  | 'bulk_pricing'
  | 'orders'
  | 'order_items'

type MockState = Record<TableName, Array<Record<string, any>>>

function cloneState(state: MockState): MockState {
  return {
    distributor_vendors: state.distributor_vendors.map((row) => ({ ...row })),
    products: state.products.map((row) => ({ ...row })),
    vendor_price_overrides: state.vendor_price_overrides.map((row) => ({ ...row })),
    bulk_pricing: state.bulk_pricing.map((row) => ({ ...row })),
    orders: state.orders.map((row) => ({ ...row })),
    order_items: state.order_items.map((row) => ({ ...row }))
  }
}

class MockQueryBuilder {
  private table: TableName
  private state: MockState
  private operation: 'select' | 'insert' | 'delete' = 'select'
  private rowsToInsert: Array<Record<string, any>> = []
  private filters: Array<{ type: 'eq' | 'in' | 'is'; column: string; value: any }> = []
  private maxRows: number | null = null

  constructor(table: TableName, state: MockState) {
    this.table = table
    this.state = state
  }

  select(_columns?: string) {
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  in(column: string, values: any[]) {
    this.filters.push({ type: 'in', column, value: values })
    return this
  }

  is(column: string, value: any) {
    this.filters.push({ type: 'is', column, value })
    return this
  }

  limit(value: number) {
    this.maxRows = value
    return this
  }

  insert(payload: Record<string, any> | Array<Record<string, any>>) {
    this.operation = 'insert'
    this.rowsToInsert = Array.isArray(payload) ? payload : [payload]
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  async maybeSingle() {
    const result = await this.executeSelect()
    return {
      data: result.data.length > 0 ? result.data[0] : null,
      error: result.error
    }
  }

  async single() {
    if (this.operation === 'insert') {
      const inserted = this.performInsert()
      return {
        data: inserted.length > 0 ? inserted[0] : null,
        error: null
      }
    }

    const result = await this.executeSelect()
    return {
      data: result.data.length > 0 ? result.data[0] : null,
      error: result.error
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any)
  }

  private async execute() {
    if (this.operation === 'insert') {
      return { data: this.performInsert(), error: null }
    }

    if (this.operation === 'delete') {
      const rows = this.state[this.table]
      const toDelete = this.applyFilters(rows)
      const keep = rows.filter((row) => !toDelete.includes(row))
      this.state[this.table] = keep
      return { data: toDelete, error: null }
    }

    return this.executeSelect()
  }

  private async executeSelect() {
    const rows = this.state[this.table]
    const filtered = this.applyFilters(rows).map((row) => ({ ...row }))
    const data = this.maxRows == null ? filtered : filtered.slice(0, this.maxRows)
    return { data, error: null }
  }

  private performInsert() {
    const rows = this.rowsToInsert.map((row) => {
      if (this.table === 'orders') {
        return {
          id: `order-${this.state.orders.length + 1}`,
          ...row
        }
      }
      return { ...row }
    })

    this.state[this.table].push(...rows)
    return rows.map((row) => ({ ...row }))
  }

  private applyFilters(rows: Array<Record<string, any>>): Array<Record<string, any>> {
    return rows.filter((row) => {
      for (const filter of this.filters) {
        if (filter.type === 'eq') {
          if (row[filter.column] !== filter.value) return false
          continue
        }

        if (filter.type === 'is') {
          if (filter.value === null) {
            if (row[filter.column] !== null && row[filter.column] !== undefined) return false
            continue
          }
          if (row[filter.column] !== filter.value) return false
          continue
        }

        const values = Array.isArray(filter.value) ? filter.value : []
        if (!values.includes(row[filter.column])) return false
      }
      return true
    })
  }
}

class MockSupabase {
  readonly state: MockState

  constructor(initialState: MockState) {
    this.state = cloneState(initialState)
  }

  from(table: TableName) {
    return new MockQueryBuilder(table, this.state)
  }
}

function createBaseState(overrides: Array<{ distributor_id: string; vendor_id: string; product_id: string; price_per_unit?: number | null; price_per_case?: number | null }>): MockState {
  return {
    distributor_vendors: [
      { distributor_id: 'dist-a', vendor_id: 'vendor-1' },
      { distributor_id: 'dist-b', vendor_id: 'vendor-1' }
    ],
    products: [
      {
        id: 'product-1',
        distributor_id: 'dist-a',
        name: 'Br',
        cost_price: 1,
        sell_price: 9.4286,
        price_case: 66,
        stock_pieces: 700,
        allow_case: true,
        allow_piece: true,
        units_per_case: 7,
        cost_per_unit: 1,
        sell_per_unit: 9.4286,
        cost_per_case: 7,
        sell_per_case: 66,
        deleted_at: null
      },
      {
        id: 'product-2',
        distributor_id: 'dist-b',
        name: 'Dist B Product',
        cost_price: 1,
        sell_price: 9.4286,
        price_case: 66,
        stock_pieces: 700,
        allow_case: true,
        allow_piece: true,
        units_per_case: 7,
        cost_per_unit: 1,
        sell_per_unit: 9.4286,
        cost_per_case: 7,
        sell_per_case: 66,
        deleted_at: null
      }
    ],
    vendor_price_overrides: overrides.map((row) => ({
      price_per_unit: null,
      price_per_case: null,
      ...row
    })),
    bulk_pricing: [],
    orders: [],
    order_items: []
  }
}

async function runCreateOrder(supabase: MockSupabase, options?: Partial<CreateOrderParams>) {
  return createOrder({
    supabase,
    distributorId: 'dist-a',
    vendorId: 'vendor-1',
    items: [
      { product_id: 'product-1', qty: 1, order_unit: 'case' }
    ],
    createdByUserId: 'vendor-1',
    createdByRole: 'vendor',
    createdSource: 'test-suite',
    ...options
  })
}

test('case override is applied to case orders and snapshot math stays deterministic', async () => {
  const supabase = new MockSupabase(createBaseState([
    { distributor_id: 'dist-a', vendor_id: 'vendor-1', product_id: 'product-1', price_per_case: 50 }
  ]))

  const result = await runCreateOrder(supabase, {
    items: [{ product_id: 'product-1', qty: 2, order_unit: 'case' }]
  })

  assert.equal(result.ok, true)
  assert.equal(supabase.state.order_items.length, 1)

  const row = supabase.state.order_items[0]
  assert.equal(row.order_unit, 'case')
  assert.equal(row.qty, 2)
  assert.equal(Number(row.unit_price), 50)
  assert.equal(Number(row.case_price_snapshot), 50)
  assert.ok(Math.abs(Number(row.unit_price_snapshot) - 7.142857) < 0.000001)
  assert.equal(Math.round(Number(row.unit_price) * Number(row.qty) * 100) / 100, 100)
})

test('unit price is derived from case override when ordering by unit', async () => {
  const supabase = new MockSupabase(createBaseState([
    { distributor_id: 'dist-a', vendor_id: 'vendor-1', product_id: 'product-1', price_per_case: 50 }
  ]))

  const result = await runCreateOrder(supabase, {
    items: [{ product_id: 'product-1', qty: 3, order_unit: 'piece' }]
  })

  assert.equal(result.ok, true)
  assert.equal(supabase.state.order_items.length, 1)

  const row = supabase.state.order_items[0]
  assert.equal(row.order_unit, 'piece')
  assert.ok(Math.abs(Number(row.unit_price) - 7.142857) < 0.000001)
  assert.equal(Number(row.case_price_snapshot), 50)
  assert.equal(Math.round(Number(row.unit_price) * Number(row.qty) * 100) / 100, 21.43)
})

test('order snapshots remain immutable after override changes', async () => {
  const supabase = new MockSupabase(createBaseState([
    { distributor_id: 'dist-a', vendor_id: 'vendor-1', product_id: 'product-1', price_per_case: 50 }
  ]))

  const first = await runCreateOrder(supabase)
  assert.equal(first.ok, true)
  assert.equal(Number(supabase.state.order_items[0].case_price_snapshot), 50)

  supabase.state.vendor_price_overrides[0].price_per_case = 60

  const second = await runCreateOrder(supabase)
  assert.equal(second.ok, true)
  assert.equal(Number(supabase.state.order_items[1].case_price_snapshot), 60)
  assert.equal(Number(supabase.state.order_items[0].case_price_snapshot), 50)
})

test('override rows from a different distributor are ignored', async () => {
  const supabase = new MockSupabase({
    ...createBaseState([
      { distributor_id: 'dist-a', vendor_id: 'vendor-1', product_id: 'product-1', price_per_case: 50 },
      { distributor_id: 'dist-a', vendor_id: 'vendor-1', product_id: 'product-2', price_per_case: 40 }
    ])
  })

  const result = await createOrder({
    supabase,
    distributorId: 'dist-b',
    vendorId: 'vendor-1',
    items: [{ product_id: 'product-2', qty: 1, order_unit: 'case' }],
    createdByUserId: 'vendor-1',
    createdByRole: 'vendor',
    createdSource: 'test-suite'
  })

  assert.equal(result.ok, true)
  assert.equal(supabase.state.order_items.length, 1)
  assert.equal(Number(supabase.state.order_items[0].unit_price), 66)
})
