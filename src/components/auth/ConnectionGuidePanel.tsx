import { Building2, Store, Link2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const VENDOR_STEPS = [
  'Ask your distributor for their unique distributor code.',
  'Log in or sign up as a vendor.',
  'Open the connect distributor section in your dashboard.',
  'Enter the code exactly as provided.',
  'Once connected, you can access the products and pricing shared with you.',
]

const DISTRIBUTOR_STEPS = [
  'Log in or sign up as a distributor.',
  'Find your unique distributor code in your dashboard/account section.',
  'Share the code with vendors you want to connect.',
  'The vendor enters that code from their vendor account.',
  'You control what connected vendors can access.',
]

function GuideColumn({
  title,
  icon: Icon,
  steps,
  accentClassName,
}: {
  title: string
  icon: typeof Store
  steps: string[]
  accentClassName: string
}) {
  return (
    <section className="min-w-0 rounded-[24px] border border-white/14 bg-slate-950/28 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accentClassName}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">{title}</p>
          <p className="text-sm text-white/78">Simple connection steps</p>
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/10 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="min-w-0 text-sm leading-6 text-white/82">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ConnectionGuidePanel() {
  return (
    <Card className="rounded-[30px] border-white/16 bg-white/[0.1] text-white shadow-[0_26px_64px_-42px_rgba(2,6,23,0.95)] backdrop-blur-[18px] hover:translate-y-0 hover:shadow-[0_26px_64px_-42px_rgba(2,6,23,0.95)]">
      <CardHeader className="space-y-3 pb-5">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
          <Link2 className="h-3.5 w-3.5" />
          Connection Guide
        </div>
        <div className="space-y-2">
          <CardTitle className="text-xl text-white sm:text-2xl">
            How Vendor & Distributor Connection Works
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6 text-white/72">
            Follow the role-specific steps below to connect vendor and distributor accounts using the correct distributor code.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <GuideColumn
            title="For Vendors"
            icon={Store}
            steps={VENDOR_STEPS}
            accentClassName="bg-gradient-to-br from-cyan-500 to-sky-600 shadow-[0_12px_24px_-16px_rgba(6,182,212,0.85)]"
          />
          <GuideColumn
            title="For Distributors"
            icon={Building2}
            steps={DISTRIBUTOR_STEPS}
            accentClassName="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_12px_24px_-16px_rgba(16,185,129,0.85)]"
          />
        </div>

        <div className="rounded-[24px] border border-cyan-400/18 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50">
          Connections only work with the correct distributor code, and vendor access always follows distributor settings.
        </div>
      </CardContent>
    </Card>
  )
}
