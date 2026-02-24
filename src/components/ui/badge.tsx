import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/35 focus:ring-offset-2",
                {
                    "border-transparent bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-2))] text-white": variant === "default",
                    "border-transparent bg-[hsl(var(--surface-muted))] text-slate-700": variant === "secondary",
                    "border-red-200 bg-red-50 text-red-700": variant === "destructive",
                    "border-[hsl(var(--surface-border))] bg-white/85 text-slate-700": variant === "outline",
                    "border-emerald-200 bg-emerald-50 text-emerald-700": variant === "success",
                    "border-amber-200 bg-amber-50 text-amber-700": variant === "warning",
                },
                className
            )}
            {...props}
        />
    )
}

export { Badge }
