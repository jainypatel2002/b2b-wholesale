export default function InvoicesLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-9 w-32 bg-slate-200 rounded" />
                <div className="flex gap-2">
                    <div className="h-9 w-28 bg-slate-200 rounded" />
                    <div className="h-9 w-28 bg-slate-200 rounded" />
                </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="h-12 bg-slate-100 border-b" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex gap-4 p-4 border-b border-slate-100">
                        <div className="h-4 w-24 bg-slate-200 rounded" />
                        <div className="h-4 w-32 bg-slate-200 rounded" />
                        <div className="h-4 w-16 bg-slate-200 rounded" />
                        <div className="h-4 w-20 bg-slate-200 rounded" />
                        <div className="ml-auto h-8 w-20 bg-slate-200 rounded" />
                    </div>
                ))}
            </div>
        </div>
    )
}
