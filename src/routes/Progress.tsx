import { Link } from 'react-router-dom'
import { ProgressSection } from '../components/profile/ProgressSection'

/** How spending, food and training have gone over 3, 6 or 12 months. */
export default function Progress() {
  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="flex min-h-11 items-center self-start text-pond">Back to Today</Link>
      <ProgressSection asPage />
    </div>
  )
}
