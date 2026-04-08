export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-end justify-between">
        <div>
          <div className="h-10 w-80 bg-aa-elevated rounded-lg" />
          <div className="h-4 w-60 bg-aa-elevated rounded mt-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-36 bg-aa-elevated rounded-lg" />
          <div className="h-9 w-28 bg-aa-elevated rounded-lg" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-aa-surface border border-aa-border rounded-xl p-5 h-[160px]">
            <div className="h-3 w-20 bg-aa-elevated rounded mb-4" />
            <div className="h-10 w-24 bg-aa-elevated rounded" />
          </div>
        ))}
      </div>

      {/* Main grid skeleton */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 bg-aa-surface border border-aa-border rounded-xl h-[340px]" />
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl h-[340px]" />
        <div className="col-span-5 bg-aa-surface border border-aa-border rounded-xl h-[300px]" />
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl h-[300px]" />
        <div className="col-span-3 space-y-4">
          <div className="bg-aa-surface border border-aa-border rounded-xl h-[140px]" />
          <div className="bg-aa-surface border border-aa-border rounded-xl h-[140px]" />
        </div>
      </div>
    </div>
  );
}
