import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
                    {
                        "brand-gradient text-white shadow-[0_12px_24px_-16px_rgba(15,23,42,0.85)] hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-20px_rgba(15,23,42,0.9)] active:translate-y-0": variant === "default",
                        "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-[0_12px_24px_-16px_rgba(127,29,29,0.65)] hover:-translate-y-0.5 hover:from-red-500/95 hover:to-rose-500/95": variant === "destructive",
                        "border border-[hsl(var(--surface-border))] bg-white/80 text-slate-700 shadow-sm hover:bg-white hover:text-slate-900": variant === "outline",
                        "border border-transparent bg-slate-100/90 text-slate-700 hover:bg-slate-100 hover:text-slate-900": variant === "secondary",
                        "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900": variant === "ghost",
                        "rounded-none px-0 text-primary underline-offset-4 hover:text-primary/80 hover:underline": variant === "link",
                        "h-10 px-4 py-2": size === "default",
                        "h-9 px-3.5 text-xs": size === "sm",
                        "h-11 px-8": size === "lg",
                        "h-10 w-10": size === "icon",
                    },
                    className
                )}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
