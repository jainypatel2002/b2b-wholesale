'use client'

import React, { useEffect } from 'react'
import { StatusBadge } from '@/components/status-badge'

interface InvoicePrintProps {
    invoice: any
    distributor?: any
    vendor?: any
}

export function InvoicePrint({ invoice, distributor, vendor }: InvoicePrintProps) {
    // Auto-print when this component mounts (optional, but requested behavior usually implies this)
    useEffect(() => {
        // Small delay to ensure rendering
        const timer = setTimeout(() => {
            window.print()
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    const items = invoice.invoice_items || []

    return (
        <div className="bg-white text-black bg-white p-8 max-w-4xl mx-auto print:max-w-none print:p-0">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">INVOICE</h1>
                    <p className="text-gray-500 mt-1">#{invoice.invoice_number}</p>
                </div>
                <div className="text-right">
                    {distributor?.business_name && (
                        <h2 className="text-xl font-semibold">{distributor.business_name}</h2>
                    )}
                    <p className="text-sm text-gray-600">Date: {new Date(invoice.created_at).toLocaleDateString()}</p>
                    <div className="mt-2 text-sm">
                        <span className="font-semibold">Payment Status: </span>
                        <span className="uppercase">{invoice.payment_status}</span>
                    </div>
                </div>
            </div>

            {/* Bill To */}
            <div className="mb-8">
                <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-2">Bill To</h3>
                {vendor?.business_name && <p className="font-medium text-lg">{vendor.business_name}</p>}
                {vendor?.email && <p className="text-gray-600">{vendor.email}</p>}
                {vendor?.phone && <p className="text-gray-600">{vendor.phone}</p>}
            </div>

            {/* Items Table */}
            <table className="w-full text-left mb-8">
                <thead>
                    <tr className="border-b-2 border-gray-200">
                        <th className="py-3 text-sm font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                        <th className="py-3 text-sm font-semibold text-gray-600 uppercase tracking-wider text-right">Qty</th>
                        <th className="py-3 text-sm font-semibold text-gray-600 uppercase tracking-wider text-right">Price</th>
                        <th className="py-3 text-sm font-semibold text-gray-600 uppercase tracking-wider text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item: any, index: number) => (
                        <tr key={index} className="border-b border-gray-100">
                            <td className="py-3 text-gray-800">
                                {item.products?.name || 'Unknown Product'}
                            </td>
                            <td className="py-3 text-gray-800 text-right">{item.qty}</td>
                            <td className="py-3 text-gray-800 text-right">{Number(item.unit_price).toFixed(2)}</td>
                            <td className="py-3 text-gray-800 text-right">
                                {(Number(item.qty) * Number(item.unit_price)).toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
                <div className="w-64 space-y-3">
                    <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>{Number(invoice.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(invoice.tax) > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Tax</span>
                            <span>{Number(invoice.tax).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-lg font-bold text-gray-800 border-t border-gray-200 pt-3">
                        <span>Total</span>
                        <span>{Number(invoice.total).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Footer Notes */}
            <div className="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
                <p>Thank you for your business.</p>
            </div>

            {/* Print Button (Hidden when printing) */}
            <div className="mt-8 text-center print:hidden">
                <button
                    onClick={() => window.print()}
                    className="bg-zinc-800 text-white px-6 py-2 rounded shadow hover:bg-zinc-700 transition"
                >
                    Print Invoice
                </button>
                <p className="mt-2 text-xs text-gray-400">Press Cmd+P or Ctrl+P if dialog doesn't open.</p>
            </div>
        </div>
    )
}
