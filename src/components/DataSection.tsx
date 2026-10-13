import { useRef, useState } from 'react'
import { localDate } from '../domain/dates'
import { deleteEverything, deleteHealthData, exportAll, importAll, transactionsCsv } from '../domain/backup'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { useToast } from './ui/Toast'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TypedConfirm({ open, title, body, action, onClose, onConfirm }: { open: boolean; title: string; body: string; action: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [text, setText] = useState('')
  return (
    <Sheet open={open} onClose={() => { setText(''); onClose() }} title={title}>
      <div className="flex flex-col gap-3">
        <p>{body}</p>
        <label className="flex flex-col gap-1">
          Type delete to confirm
          <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" autoComplete="off" />
        </label>
        <Button variant="danger" disabled={text.trim().toLowerCase() !== 'delete'} onClick={async () => { await onConfirm(); setText('') }}>{action}</Button>
      </div>
    </Sheet>
  )
}

export function DataSection() {
  const db = useDb()
  const toast = useToast()
  const { settings, update } = useSettings()
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'health' | 'all' | null>(null)

  return (
    <section aria-labelledby="data" className="flex flex-col gap-2">
      <h2 id="data" className="font-semibold">Your data</h2>
      <p className="text-sm text-slate">
        {settings.lastBackupAt ? `Last backup ${settings.lastBackupAt.slice(0, 10)}.` : 'No backup yet.'} Backups are files you keep; restore one here or in another browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const backup = await exportAll(db)
            download(`tally-backup-${localDate()}.json`, JSON.stringify(backup), 'application/json')
            await update({ lastBackupAt: new Date().toISOString() })
            toast.show('Backup downloaded')
          }}
        >
          Download backup
        </Button>
        <Button variant="secondary" onClick={async () => download(`tally-transactions-${localDate()}.csv`, await transactionsCsv(db), 'text/csv')}>
          Export transactions (CSV)
        </Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>Restore from backup</Button>
      </div>
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
            onClick={async () => {
              try {
                await importAll(db, pending)
                location.reload()
              } catch (err) {
                setPending(null)
                setError(`${err instanceof Error ? err.message : String(err)} Nothing was changed.`)
              }
            }}
          >
            Replace my data
          </Button>
        </div>
      </Sheet>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setConfirm('health')}>Delete health data…</Button>
        <Button variant="secondary" onClick={() => setConfirm('all')}>Delete everything…</Button>
      </div>
      <TypedConfirm
        open={confirm === 'health'} title="Delete health data" action="Delete health data" onClose={() => setConfirm(null)}
        body="This permanently deletes your food logs, foods you created and body weight. Money and training stay."
        onConfirm={async () => {
          await deleteHealthData(db)
          await update({})
          setConfirm(null)
          toast.show('Health data deleted')
        }}
      />
      <TypedConfirm
        open={confirm === 'all'} title="Delete everything" action="Delete everything" onClose={() => setConfirm(null)}
        body="This permanently deletes all your Tally data on this device. Download a backup first if you might want it back."
        onConfirm={async () => {
          await deleteEverything(db)
          location.assign('/')
        }}
      />
    </section>
  )
}
