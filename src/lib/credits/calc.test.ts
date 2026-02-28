import assert from 'node:assert/strict'
import test from 'node:test'
import { computeAmountDue, computeOrderTotal, computeVendorCreditBalance } from './calc'

test('computeVendorCreditBalance sums ledger types correctly', () => {
    const balance = computeVendorCreditBalance([
        { type: 'credit_add', amount: 120 },
        { type: 'credit_apply', amount: 35 },
        { type: 'credit_deduct', amount: 10 },
        { type: 'credit_reversal', amount: 5.5 },
    ])

    assert.equal(balance, 80.5)
})

test('computeOrderTotal includes adjustments and mixed tax types', () => {
    const total = computeOrderTotal({
        subtotal: 100,
        adjustmentTotal: 20,
        taxes: [
            { type: 'percent', rate_percent: 10 },
            { type: 'fixed', rate_percent: 3.75 },
        ],
    })

    assert.equal(total, 135.75)
})

test('computeAmountDue never goes below zero', () => {
    assert.equal(computeAmountDue(50, 20), 30)
    assert.equal(computeAmountDue(50, 80), 0)
})
