import { useState } from 'react'
import { Amount } from '../../components/ui/Amount'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { EmptyState } from '../../components/ui/EmptyState'
import { ListRow } from '../../components/ui/ListRow'
import { Sheet } from '../../components/ui/Sheet'
import { TallyMarks } from '../../components/ui/TallyMarks'
import { useToast } from '../../components/ui/Toast'

export default function Styleguide() {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState('Groceries')
  const toast = useToast()
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-display text-xl font-semibold">Styleguide</h1>
      <div className="mt-4"><Amount pence={8620} size="hero" /></div>
      <p className="text-slate">left to spend this week</p>
      <div className="mt-4"><TallyMarks percent={68} seed="holiday" label="Holiday 2026, 68% saved, £640 to go" /></div>
      <p className="text-sm text-slate">68% saved, £640 to go</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Groceries', 'Eating out', 'Bills'].map((c) => <Chip key={c} selected={sel === c} onClick={() => setSel(c)}>{c}</Chip>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => toast.show('Expense saved', { undo: () => {} })}>Save expense</Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>Open sheet</Button>
        <Button variant="quiet">Quiet</Button>
        <Button variant="danger">Delete</Button>
      </div>
      <div className="mt-4">
        <ListRow title="Tesco" detail="Groceries" trailing={<Amount pence={340} />} />
        <ListRow title="Train" detail="Transport" trailing={<Amount pence={1280} />} />
      </div>
      <EmptyState message="No spending yet this month" action={{ label: 'Add expense', onClick: () => {} }} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Add expense"><Amount pence={340} size="title" /></Sheet>
    </main>
  )
}
