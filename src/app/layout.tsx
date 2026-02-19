import './globals.css'
import type { Metadata } from 'next'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Distributor Vendor Portal',
  description: 'Inventory, orders, invoices, and profit tracking.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-dvh">
          {children}
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
