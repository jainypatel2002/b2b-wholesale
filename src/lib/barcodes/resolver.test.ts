import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProductByBarcode } from './resolver'

type QueryState = {
  table: string
  filters: Record<string, any>
  isFilters: Record<string, any>
  selectColumns?: any
  selectOptions?: any
  insertPayload?: any
}

type MockResult = {
  data?: any
  error?: any
  count?: number | null
}

function createMockSupabase(handler: (state: QueryState, action: 'select' | 'maybeSingle') => MockResult | Promise<MockResult>) {
  return {
    from(table: string) {
      const state: QueryState = {
        table,
        filters: {},
        isFilters: {}
      }

      const query: any = {
        select(columns: any, options?: any) {
          state.selectColumns = columns
          state.selectOptions = options
          return query
        },
        insert(payload: any) {
          state.insertPayload = payload
          return query
        },
        eq(column: string, value: any) {
          state.filters[column] = value
          return query
        },
        is(column: string, value: any) {
          state.isFilters[column] = value
          return query
        },
        limit() {
          return query
        },
        maybeSingle() {
          return Promise.resolve(handler({ ...state }, 'maybeSingle'))
        },
        then(resolve: any, reject: any) {
          return Promise.resolve(handler({ ...state }, 'select')).then(resolve, reject)
        }
      }

      return query
    }
  }
}

describe('resolveProductByBarcode', () => {
  test('resolves mapped alias from product_barcodes', async () => {
    const supabase = createMockSupabase((state, action) => {
      if (state.table === 'product_barcodes' && action === 'maybeSingle') {
        return {
          data: {
            id: 'map-1',
            product_id: 'aaaaaaaa-1111-4111-8111-111111111111',
            distributor_id: '11111111-1111-4111-8111-111111111111',
            barcode: 'ABC12345',
            is_primary: false
          }
        }
      }

      if (state.table === 'products' && action === 'maybeSingle' && state.filters.id === 'aaaaaaaa-1111-4111-8111-111111111111') {
        return {
          data: {
            id: 'aaaaaaaa-1111-4111-8111-111111111111',
            distributor_id: '11111111-1111-4111-8111-111111111111',
            barcode: 'ABC12345',
            active: true,
            is_active: true,
            deleted_at: null
          }
        }
      }

      throw new Error(`Unexpected query: ${state.table}`)
    })

    const resolved = await resolveProductByBarcode({
      supabase,
      distributorId: '11111111-1111-4111-8111-111111111111',
      barcode: 'abc-12345',
      viewerRole: 'distributor'
    })

    assert.ok(resolved)
    assert.equal(resolved?.source, 'product_barcodes')
    assert.equal(resolved?.normalizedBarcode, 'ABC12345')
    assert.equal(resolved?.product?.id, 'aaaaaaaa-1111-4111-8111-111111111111')
  })

  test('falls back to legacy products.barcode and backfills for distributor', async () => {
    let inserted = false

    const supabase = createMockSupabase((state, action) => {
      if (state.table === 'product_barcodes' && action === 'maybeSingle' && !state.insertPayload) {
        return { data: null }
      }

      if (state.table === 'products' && action === 'maybeSingle' && state.filters.barcode === '01234567') {
        return {
          data: {
            id: 'bbbbbbbb-2222-4222-8222-222222222222',
            distributor_id: '22222222-2222-4222-8222-222222222222',
            barcode: '01234567',
            active: true,
            is_active: true,
            deleted_at: null
          }
        }
      }

      if (state.table === 'product_barcodes' && action === 'select' && state.selectOptions?.head === true) {
        return { count: 0, error: null }
      }

      if (state.table === 'product_barcodes' && action === 'maybeSingle' && state.insertPayload) {
        inserted = true
        return {
          data: {
            id: 'map-2',
            product_id: 'bbbbbbbb-2222-4222-8222-222222222222',
            distributor_id: '22222222-2222-4222-8222-222222222222',
            barcode: '01234567',
            is_primary: true,
            created_at: '2026-02-26T00:00:00Z'
          }
        }
      }

      throw new Error(`Unexpected query: ${state.table}`)
    })

    const resolved = await resolveProductByBarcode({
      supabase,
      distributorId: '22222222-2222-4222-8222-222222222222',
      barcode: ' 0123-4567 ',
      viewerRole: 'distributor'
    })

    assert.ok(resolved)
    assert.equal(resolved?.source, 'products.barcode')
    assert.equal(resolved?.normalizedBarcode, '01234567')
    assert.equal(inserted, true)
    assert.equal(resolved?.matchedBarcode?.is_primary, true)
  })

  test('returns null for vendor not linked to distributor', async () => {
    const supabase = createMockSupabase((state, action) => {
      if (state.table === 'distributor_vendors' && action === 'maybeSingle') {
        return { data: null }
      }
      throw new Error(`Unexpected query: ${state.table}`)
    })

    const resolved = await resolveProductByBarcode({
      supabase,
      distributorId: '33333333-3333-4333-8333-333333333333',
      barcode: 'ABC12345',
      viewerRole: 'vendor',
      vendorId: '99999999-9999-4999-8999-999999999999'
    })

    assert.equal(resolved, null)
  })
})
