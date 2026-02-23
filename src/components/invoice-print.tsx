'use client'

import React, { useEffect } from 'react'
import { formatPriceLabel, formatQtyLabel, OrderMode } from '@/lib/pricing-engine'

interface InvoicePrintProps {
    invoice: any
    distributor?: any
    vendor?: any
    isEmbedded?: boolean
}

export function InvoicePrint({ invoice, distributor, vendor, isEmbedded = false }: InvoicePrintProps) {
    useEffect(() => {
        if (isEmbedded) return
        const timer = setTimeout(() => {
            window.print()
        }, 500)
        return () => clearTimeout(timer)
    }, [])

    const items = invoice.invoice_items || []
    const taxes = invoice.invoice_taxes || []

    return (
        <div className="bg-white text-black min-h-screen p-8 max-w-[800px] mx-auto print:max-w-none print:p-0 print:m-0 font-sans">
            {/* Header Section */}
            <div className="flex justify-between items-start mb-10">
                {/* Left: Distributor Info */}
                <div className="space-y-1 text-sm text-slate-700">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase mb-2">
                        {distributor?.business_name || 'Distributor'}
                    </h1>
                    {distributor?.email && <p>{distributor.email}</p>}
                </div>

                {/* Right: Invoice Meta */}
                <div className="text-right">
                    <h2 className="text-4xl font-light text-slate-300 uppercase tracking-widest mb-4">Invoice</h2>
                    <table className="ml-auto text-sm mr-2">
                        <tbody>
                            <tr>
                                <td className="py-1 pr-6 font-semibold text-slate-600">Invoice Number:</td>
                                <td className="py-1 text-slate-900">{invoice.invoice_number}</td>
                            </tr>
                            <tr>
                                <td className="py-1 pr-6 font-semibold text-slate-600">Invoice Date:</td>
                                <td className="py-1 text-slate-900">{new Date(invoice.created_at).toLocaleDateString()}</td>
                            </tr>
                            {invoice.terms && (
                                <tr>
                                    <td className="py-1 pr-6 font-semibold text-slate-600">Terms:</td>
                                    <td className="py-1 text-slate-900">{invoice.terms}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bill To */}
            <div className="mb-10">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 border-b pb-2">Bill To</h3>
                <div className="text-sm text-slate-800 space-y-1">
                    <p className="font-semibold text-base">{vendor?.business_name || 'Vendor'}</p>
                    {vendor?.location_address && <p className="whitespace-pre-line">{vendor.location_address}</p>}
                    {vendor?.phone && <p>{vendor.phone}</p>}
                    {vendor?.email && <p>{vendor.email}</p>}
                </div>
            </div>

            {/* Main Item Grid */}
            <table className="w-full text-sm mb-10 border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-y border-slate-200">
                        <th className="py-3 px-2 text-left font-semibold text-slate-600">Item</th>
                        <th className="py-3 px-2 text-left font-semibold text-slate-600 w-[120px]">UPC/SKU</th>
                        <th className="py-3 px-2 text-right font-semibold text-slate-600 w-[80px]">Qty</th>
                        <th className="py-3 px-2 text-right font-semibold text-slate-600 w-[100px]">Rate</th>
                        <th className="py-3 px-2 text-right font-semibold text-slate-600 w-[100px]">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((item: any, idx: number) => {
                        if (item.is_manual) {
                            return (
                                <tr key={idx} className="group hover:bg-slate-50">
                                    <td className="py-3 px-2 font-medium text-slate-800">{item.product_name}</td>
                                    <td className="py-3 px-2 text-slate-500">—</td>
                                    <td className="py-3 px-2 text-right text-slate-800">1</td>
                                    <td className="py-3 px-2 text-right text-slate-800">${Number(item.unit_price).toFixed(2)}</td>
                                    <td className="py-3 px-2 text-right font-medium text-slate-900">${Number(item.ext_amount).toFixed(2)}</td>
                                </tr>
                            )
                        }

                        const name = item.product_name || item.products?.name || 'Unknown Product'
                        const effectiveQty = item.effective_units ?? item.qty
                        const extAmount = item.ext_amount ?? (effectiveQty * Number(item.unit_price))

                        return (
                            <tr key={idx} className="group hover:bg-slate-50">
                                <td className="py-3 px-2">
                                    <div className="font-medium text-slate-800">{name}</div>
                                    {item.category_name && <div className="text-xs text-slate-400 mt-0.5">{item.category_name}</div>}
                                </td>
                                <td className="py-3 px-2 text-slate-600">
                                    <div className="truncate">{item.item_code || item.upc || '—'}</div>
                                </td>
                                <td className="py-3 px-2 text-right text-slate-800">
                                    {formatQtyLabel(effectiveQty, item.order_unit)}
                                    {item.order_unit === 'case' && (item.units_per_case_snapshot ?? 0) > 0 && (
                                        <div className="text-[10px] text-slate-400">@ {item.units_per_case_snapshot}/case</div>
                                    )}
                                </td>
                                <td className="py-3 px-2 text-right text-slate-800">
                                    {formatPriceLabel(Number(item.unit_price), item.order_unit)}
                                </td>
                                <td className="py-3 px-2 text-right font-medium text-slate-900">
                                    ${Number(extAmount).toFixed(2)}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            {/* Totals Section */}
            <div className="flex justify-end pt-4">
                <div className="w-72">
                    <table className="w-full text-sm">
                        <tbody>
                            <tr>
                                <td className="py-2 text-slate-600">Subtotal</td>
                                <td className="py-2 text-right font-medium text-slate-900">${Number(invoice.subtotal).toFixed(2)}</td>
                            </tr>

                            {taxes.map((tax: any) => (
                                <tr key={tax.id}>
                                    <td className="py-2 text-slate-600">{tax.name} {tax.type === 'percent' && `(${tax.rate_percent}%)`}</td>
                                    <td className="py-2 text-right text-slate-900">${Number(tax.amount).toFixed(2)}</td>
                                </tr>
                            ))}

                            {/* Fallback legacy tax if no invoice_taxes exist but tax field has value */}
                            {taxes.length === 0 && Number(invoice.tax) > 0 && (
                                <tr>
                                    <td className="py-2 text-slate-600">Tax</td>
                                    <td className="py-2 text-right text-slate-900">${Number(invoice.tax).toFixed(2)}</td>
                                </tr>
                            )}

                            <tr className="border-t-2 border-slate-900">
                                <td className="py-3 font-bold text-slate-900 uppercase">Total</td>
                                <td className="py-3 text-right font-bold text-lg text-slate-900">${Number(invoice.total).toFixed(2)}</td>
                            </tr>

                            {/* Payment Status Ribbon */}
                            <tr>
                                <td colSpan={2} className="pt-4">
                                    <div className={`text-center py-2 px-4 rounded font-bold uppercase tracking-wider text-xs ${invoice.payment_status === 'paid'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                        }`}>
                                        {invoice.payment_status}
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer / Notes */}
            {invoice.notes && (
                <div className="mt-16 pt-6 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</h4>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{invoice.notes}</p>
                </div>
            )}

            {!invoice.notes && (
                <div className="mt-16 pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
                    Thank you for your business.
                </div>
            )}

            {/* Print Controls - hidden if embedded */}
            {!isEmbedded && (
                <div className="mt-12 text-center print:hidden">
                    <button
                        onClick={() => window.print()}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium shadow hover:bg-blue-700 transition"
                    >
                        Print or Save as PDF
                    </button>
                    <p className="mt-3 text-xs text-slate-400">Press Cmd+P or Ctrl+P to open the print dialog</p>
                </div>
            )}
        </div>
    )
}
