'use client'

import React, { useEffect } from 'react'
import { normalizeInvoiceItem, formatMoney } from '@/lib/pricing-engine'

interface InvoicePartyProfile {
    business_name?: string | null
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address_line1?: string | null
    address_line2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
    tax_id?: string | null
    location_address?: string | null
}

interface InvoicePrintProps {
    invoice: any
    distributor?: InvoicePartyProfile
    vendor?: InvoicePartyProfile
    isEmbedded?: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizePartyProfile(
    snapshotValue: unknown,
    fallbackProfile: InvoicePartyProfile | undefined
): InvoicePartyProfile {
    const snapshot = asObject(snapshotValue)
    const fallback = fallbackProfile ?? {}

    return {
        business_name:
            asString(snapshot?.business_name) ||
            asString(fallback.business_name),
        contact_name: asString(snapshot?.contact_name) || asString(fallback.contact_name),
        email: asString(snapshot?.email) || asString(fallback.email),
        phone: asString(snapshot?.phone) || asString(fallback.phone),
        address_line1:
            asString(snapshot?.address_line1) ||
            asString(fallback.address_line1) ||
            asString(fallback.location_address),
        address_line2: asString(snapshot?.address_line2) || asString(fallback.address_line2),
        city: asString(snapshot?.city) || asString(fallback.city),
        state: asString(snapshot?.state) || asString(fallback.state),
        postal_code: asString(snapshot?.postal_code) || asString(fallback.postal_code),
        country: asString(snapshot?.country) || asString(fallback.country) || 'USA',
        tax_id: asString(snapshot?.tax_id) || asString(fallback.tax_id)
    }
}

function getAddressLines(profile: InvoicePartyProfile): string[] {
    const line1 = asString(profile.address_line1)
    const line2 = asString(profile.address_line2)
    const city = asString(profile.city)
    const state = asString(profile.state)
    const postal = asString(profile.postal_code)
    const country = asString(profile.country)

    const cityState = [city, state].filter(Boolean).join(', ')
    const cityStatePostal = [cityState, postal].filter(Boolean).join(' ')

    return [line1, line2, cityStatePostal, country].filter(Boolean)
}

function hasBusinessProfileDetails(profile: InvoicePartyProfile): boolean {
    return Boolean(
        asString(profile.business_name) ||
        asString(profile.address_line1) ||
        asString(profile.email) ||
        asString(profile.phone)
    )
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
    const sellerProfile = normalizePartyProfile(invoice?.seller_profile, distributor)
    const buyerProfile = normalizePartyProfile(invoice?.buyer_profile, vendor)
    const sellerAddressLines = getAddressLines(sellerProfile)
    const buyerAddressLines = getAddressLines(buyerProfile)

    return (
        <div className="bg-white text-black min-h-screen p-8 max-w-[800px] mx-auto print:max-w-none print:p-0 print:m-0 font-sans">
            {/* Header Section */}
            <div className="mb-10">
                <div className="flex justify-between items-start">
                    <div className="space-y-1 text-sm text-slate-700">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Invoice</p>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">
                            {invoice.invoice_number}
                        </h1>
                    </div>

                    <div className="text-right">
                        <h2 className="text-4xl font-light text-slate-300 uppercase tracking-widest mb-4">Invoice</h2>
                        <table className="ml-auto text-sm mr-2">
                            <tbody>
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

                <div className="grid gap-6 md:grid-cols-2 mt-4">
                    <div className="rounded-lg border border-slate-200 p-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">From (Distributor)</h3>
                        {hasBusinessProfileDetails(sellerProfile) ? (
                            <div className="text-sm text-slate-800 space-y-1">
                                <p className="font-semibold text-base">{sellerProfile.business_name || 'Distributor'}</p>
                                {sellerProfile.contact_name && <p>{sellerProfile.contact_name}</p>}
                                {sellerAddressLines.map((line) => <p key={`seller-${line}`}>{line}</p>)}
                                {sellerProfile.phone && <p>{sellerProfile.phone}</p>}
                                {sellerProfile.email && <p>{sellerProfile.email}</p>}
                                {sellerProfile.tax_id && <p>Tax ID: {sellerProfile.tax_id}</p>}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">Business profile not set.</p>
                        )}
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bill To (Vendor)</h3>
                        {hasBusinessProfileDetails(buyerProfile) ? (
                            <div className="text-sm text-slate-800 space-y-1">
                                <p className="font-semibold text-base">{buyerProfile.business_name || 'Vendor'}</p>
                                {buyerProfile.contact_name && <p>{buyerProfile.contact_name}</p>}
                                {buyerAddressLines.map((line) => <p key={`buyer-${line}`}>{line}</p>)}
                                {buyerProfile.phone && <p>{buyerProfile.phone}</p>}
                                {buyerProfile.email && <p>{buyerProfile.email}</p>}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">Business profile not set.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Item Grid */}
            <table className="w-full text-sm mb-10 border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-y border-slate-200 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-2 text-left font-bold text-slate-500">Category</th>
                        <th className="py-3 px-2 text-left font-bold text-slate-500">Item</th>
                        <th className="py-3 px-2 text-center font-bold text-slate-500 w-[80px]">Units/Case</th>
                        <th className="py-3 px-2 text-center font-bold text-slate-500 w-[100px]">Qty</th>
                        <th className="py-3 px-2 text-right font-bold text-slate-500 w-[100px]">Price</th>
                        <th className="py-3 px-2 text-right font-bold text-slate-500 w-[100px]">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((rawItem: any, idx: number) => {
                        const item = normalizeInvoiceItem(rawItem)
                        const price = item.mode === 'case' ? item.casePrice : item.unitPrice

                        if (item.isManual) {
                            return (
                                <tr key={idx} className="group hover:bg-slate-50 align-top">
                                    <td className="py-4 px-2 text-slate-400">—</td>
                                    <td className="py-4 px-2 font-medium text-slate-800">{item.productName}</td>
                                    <td className="py-4 px-2 text-center text-slate-400">—</td>
                                    <td className="py-4 px-2 text-center text-slate-800">{item.qty} {item.qty === 1 ? 'unit' : 'units'}</td>
                                    <td className="py-4 px-2 text-right text-slate-800">{formatMoney(price)}</td>
                                    <td className="py-4 px-2 text-right font-medium text-slate-900">{formatMoney(item.lineTotal)}</td>
                                </tr>
                            )
                        }

                        return (
                            <tr key={idx} className="group hover:bg-slate-50 align-top">
                                <td className="py-4 px-2 text-slate-500 text-xs">
                                    {item.categoryName}
                                </td>
                                <td className="py-4 px-2">
                                    <div className="font-medium text-slate-800">{item.productName}</div>
                                    {item.itemCode && <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{item.itemCode}</div>}
                                </td>
                                <td className="py-4 px-2 text-center text-slate-600">
                                    {item.mode === 'case' && item.unitsPerCase > 0 ? item.unitsPerCase : '—'}
                                </td>
                                <td className="py-4 px-2 text-center text-slate-800">
                                    <div className="font-medium">
                                        {item.qty} {item.mode === 'case' ? (item.qty === 1 ? 'case' : 'cases') : (item.qty === 1 ? 'unit' : 'units')}
                                    </div>
                                </td>
                                <td className="py-4 px-2 text-right text-slate-800 whitespace-nowrap">
                                    {formatMoney(price)}
                                    <span className="text-[10px] text-slate-400 ml-1">/ {item.mode === 'case' ? 'case' : 'unit'}</span>
                                </td>
                                <td className="py-4 px-2 text-right font-medium text-slate-900">
                                    {formatMoney(item.lineTotal)}
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
                                <td className="py-2 text-right font-medium text-slate-900">{formatMoney(invoice.subtotal)}</td>
                            </tr>

                            {taxes.map((tax: any) => (
                                <tr key={tax.id}>
                                    <td className="py-2 text-slate-600">{tax.name} {tax.type === 'percent' && `(${tax.rate_percent}%)`}</td>
                                    <td className="py-2 text-right text-slate-900">{formatMoney(tax.amount)}</td>
                                </tr>
                            ))}

                            {/* Fallback legacy tax if no invoice_taxes exist but tax field has value */}
                            {taxes.length === 0 && Number(invoice.tax) > 0 && (
                                <tr>
                                    <td className="py-2 text-slate-600">Tax</td>
                                    <td className="py-2 text-right text-slate-900">{formatMoney(invoice.tax)}</td>
                                </tr>
                            )}

                            <tr className="border-t-2 border-slate-900">
                                <td className="py-3 font-bold text-slate-900 uppercase">Total</td>
                                <td className="py-3 text-right font-bold text-lg text-slate-900">{formatMoney(invoice.total)}</td>
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
