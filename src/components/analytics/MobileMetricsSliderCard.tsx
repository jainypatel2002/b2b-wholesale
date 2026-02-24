import { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface MobileMetricItem {
    label: string
    value: ReactNode
    valueClassName?: string
}

export interface MobileMetricSlide {
    label: string
    metrics: MobileMetricItem[]
}

interface MobileMetricsSliderCardProps {
    title: ReactNode
    subtitle?: ReactNode
    headerRight?: ReactNode
    slides: MobileMetricSlide[]
    className?: string
}

export function MobileMetricsSliderCard({
    title,
    subtitle,
    headerRight,
    slides,
    className
}: MobileMetricsSliderCardProps) {
    return (
        <article className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-3", className)}>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold leading-5 text-slate-900">{title}</h4>
                    {subtitle ? (
                        <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
                    ) : null}
                </div>
                {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
            </div>

            <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Swipe metrics</span>
                <span>{slides.length} panels</span>
            </div>

            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {slides.map((slide, slideIndex) => (
                    <section
                        key={slide.label}
                        className="min-h-[132px] min-w-[82%] snap-start rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                        aria-label={`${slide.label} metrics`}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{slide.label}</p>
                            <span className="text-[11px] font-semibold text-slate-500">
                                {slideIndex + 1}/{slides.length}
                            </span>
                        </div>
                        <dl className="space-y-2">
                            {slide.metrics.map((metric, metricIndex) => (
                                <div
                                    key={`${slide.label}-${metric.label}-${metricIndex}`}
                                    className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                                >
                                    <dt className="text-xs font-medium text-slate-600">{metric.label}</dt>
                                    <dd
                                        className={cn(
                                            "whitespace-nowrap text-right text-base font-semibold tabular-nums text-slate-900",
                                            metric.valueClassName
                                        )}
                                    >
                                        {metric.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>

            <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
                {slides.map((slide, slideIndex) => (
                    <span
                        key={`${slide.label}-dot`}
                        className={cn("h-1.5 w-1.5 rounded-full", slideIndex === 0 ? "bg-slate-500" : "bg-slate-300")}
                    />
                ))}
            </div>
        </article>
    )
}
