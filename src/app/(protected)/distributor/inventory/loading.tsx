export default function InventoryLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-8 w-28 bg-slate-200 rounded" />
                <div className="h-8 w-16 bg-slate-200 rounded" />
            </div>
            <div className="flex gap-4">
                <div className="h-10 w-64 bg-slate-200 rounded" />
                <div className="h-10 w-28 bg-slate-200 rounded" />
            </div>
            {Array.from({ length: 3 }).map((_, g) => (
                <div key={g} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b">
                        <div className="h-6 w-40 bg-slate-200 rounded" />
                    </div>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex gap-4 p-4 border-b border-slate-100">
                            <div className="h-4 w-40 bg-slate-200 rounded" />
                            <div className="h-4 w-16 bg-slate-200 rounded" />
                            <div className="h-4 w-16 bg-slate-200 rounded" />
                            <div className="h-4 w-16 bg-slate-200 rounded" />
                            <div className="h-4 w-12 bg-slate-200 rounded" />
                            <div className="ml-auto h-8 w-16 bg-slate-200 rounded" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
