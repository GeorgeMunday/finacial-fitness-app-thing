import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { importAll } from '../domain/backup'
import { emitChange } from '../state/changes'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

/**
 * Picks a backup file, confirms, and restores it in place. It never reloads the page: with an in-memory
 * database (no OPFS, private browsing) a reload would throw the restored data away.
 */
export function RestoreFromBackup({ label = 'Restore from backup', variant = 'secondary' }: { label?: string; variant?: 'secondary' | 'quiet' }) {
  const db = useDb()
  const { update } = useSettings()
  const navigate = useNavigate()
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Button variant={variant} className="self-start" onClick={() => file.current?.click()}>{label}</Button>
      <input
        ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Backup file"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            setPending(JSON.parse(await f.text()))
            setError(null)
          } catch {
            setError("That file isn't a Tally backup. Choose the .json file you downloaded from Tally.")
          }
        }}
      />
      {error ? <p className="text-amber-ink">{error}</p> : null}
      <Sheet open={pending !== null} onClose={() => setPending(null)} title="Restore from backup">
        <div className="flex flex-col gap-3">
          <p>This replaces all data on this device with the backup.</p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await importAll(db, pending)
                setPending(null)
                await update({}) // re-read the restored settings
                emitChange()
                navigate('/', { replace: true })
              } catch (err) {
                setPending(null)
                setError(`${err instanceof Error ? err.message : String(err)} Nothing was changed.`)
              } finally {
                setBusy(false)
              }
            }}
          >
            Replace my data
          </Button>
        </div>
      </Sheet>
    </>
  )
}
