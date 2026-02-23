'use client'

import { useTransition, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { createInvoiceAction } from '@/app/actions/distributor'
import { useRouter } from 'next/navigation'
import { AlertCircle, FileText, X } from 'lucide-react'

export function GenerateInvoiceButton({ orderId }: { orderId: string }) {
    const [isPending, startTransition] = useTransition()
    const [showConfirm, setShowConfirm] = useState(false)
    const [mounted, setMounted] = useState(false)
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleGenerate = () => {
        startTransition(async () => {
            try {
                const res = await createInvoiceAction(orderId)
                console.log('[GenerateInvoiceButton] Response from createInvoiceAction:', res)
                if (res.error) {
                    console.error('[GenerateInvoiceButton] Error returned:', res.error)
                    alert(`Failed to generate invoice: ${res.error}`)
                    return
                }
                if (res.success && res.invoiceId) {
                    console.log('[GenerateInvoiceButton] Success! Navigating to:', `/distributor/invoices/${res.invoiceId}`)
                    router.push(`/distributor/invoices/${res.invoiceId}`)
                } else {
                    console.warn('[GenerateInvoiceButton] Success but no invoiceId?', res)
                }
            } catch (e: any) {
                alert(`Unexpected error: ${e.message}`)
            }
        })
    }

    return (
        <>
            <Button
                size="sm"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => setShowConfirm(true)}
                disabled={isPending}
            >
                <FileText className="mr-2 h-4 w-4" />
                Preview & Generate Invoice
            </Button>

            {showConfirm && mounted && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b shrink-0 bg-white">
                            <h3 className="font-semibold text-lg flex items-center text-slate-900">
                                <FileText className="h-5 w-5 mr-2 text-slate-500" />
                                Confirm Invoice Generation
                            </h3>
                            <button onClick={() => setShowConfirm(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 text-amber-800 text-sm">
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
                                <div>
                                    <p className="font-bold mb-1">This action is permanent.</p>
                                    <p className="leading-relaxed">An immutable invoice will be created for this order. Modifying prices, quantities, taxes, and fees will be locked.</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 leading-relaxed">
                                The invoice will be generated using the exact item quantities, prices, fees, and taxes currently shown in the order preview.
                            </p>

                            <p className="text-sm text-slate-500 italic">
                                Once generated, you can find this invoice in the Distributor Invoices section.
                            </p>
                        </div>

                        {/* Sticky Footer */}
                        <div className="p-4 bg-slate-50 border-t flex justify-end gap-3 shrink-0">
                            <Button
                                variant="outline"
                                onClick={() => setShowConfirm(false)}
                                disabled={isPending}
                                className="border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                disabled={isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]"
                            >
                                {isPending ? 'Generating...' : 'Yes, Generate Invoice'}
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
