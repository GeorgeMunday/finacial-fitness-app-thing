import { Button } from './Button'

export function EmptyState({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <p className="text-lg">{message}</p>
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
    </div>
  )
}
