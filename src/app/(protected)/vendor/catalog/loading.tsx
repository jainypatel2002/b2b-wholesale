export default function CatalogLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-8 w-24 bg-slate-200 rounded" />
                <div className="h-8 w-36 bg-slate-200 rounded" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
                        <div className="h-6 w-32 bg-slate-200 rounded" />
                        <div className="h-4 w-20 bg-slate-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    )
}
