const GROUP_W = 40
const STROKE_GAP = 8
const H = 28

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** Deterministic pseudo-random in [-1, 1) per seed+index. */
const jitter = (seed: string, i: number, salt: number) => ((hash(`${seed}:${i}:${salt}`) % 2000) / 1000) - 1

/** Savings drawn as hand-cut tally marks: one stroke per 5%, fives crossed. */
export function TallyMarks({ percent, seed, label, animateFrom }: { percent: number; seed: string; label: string; animateFrom?: number }) {
  const count = Math.max(0, Math.min(20, Math.floor(percent / 5)))
  const firstNew = animateFrom === undefined ? Infinity : Math.floor(animateFrom / 5)
  const groups = Math.max(1, Math.ceil(count / 5))
  const strokes = []
  for (let i = 0; i < count; i++) {
    const g = Math.floor(i / 5)
    const pos = i % 5
    const ox = g * (GROUP_W + 10) + 4
    const rot = jitter(seed, i, 1) * 3
    const dx = jitter(seed, i, 2) * 1
    const cls = i >= firstNew ? 'tally-draw' : undefined
    if (pos < 4) {
      const x = ox + pos * STROKE_GAP + dx
      strokes.push(
        <line key={i} data-stroke className={cls} pathLength={1} x1={x} y1={3} x2={x} y2={H - 3} transform={`rotate(${rot} ${x} ${H / 2})`} />,
      )
    } else {
      strokes.push(
        <line key={i} data-stroke className={cls} pathLength={1} x1={ox - 3} y1={H - 4 + dx} x2={ox + 3 * STROKE_GAP + 3} y2={4 + dx} transform={`rotate(${rot} ${ox + 12} ${H / 2})`} />,
      )
    }
  }
  const width = groups * (GROUP_W + 10)
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${H}`} width={width} height={H} style={{ maxWidth: '100%', height: 'auto' }}>
      <g stroke="var(--marigold)" strokeWidth={3} strokeLinecap="round" fill="none">{strokes}</g>
    </svg>
  )
}
