export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-fog">
      <div className="h-full bg-marigold" style={{ width: `${p}%` }} />
    </div>
  )
}
