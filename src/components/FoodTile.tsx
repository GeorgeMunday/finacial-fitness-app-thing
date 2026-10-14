/** A food's saved photo, or a quiet tile with its first letter so rows line up either way. Decorative: the name is always beside it. */
export function FoodTile({ name, photo, size = 'sm' }: { name: string; photo?: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'size-28 rounded-2xl text-3xl' : 'size-10 rounded-xl text-base'
  if (photo) return <img src={photo} alt="" className={`${box} shrink-0 border border-fog bg-surface object-contain`} />
  return (
    <span aria-hidden="true" className={`${box} flex shrink-0 items-center justify-center bg-fog font-display font-semibold text-slate`}>
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
