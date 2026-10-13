export function StorageBanner({ persistent }: { persistent: boolean }) {
  if (persistent) return null
  return (
    <div role="alert" className="border-b border-fog bg-surface px-4 py-2 text-amber-ink">
      Your data can't be saved in this browser. Use Chrome, Edge, Firefox or Safari 16.4+.
    </div>
  )
}
