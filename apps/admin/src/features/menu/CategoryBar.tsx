import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Category } from './api'

export function CategoryBar({
  categories,
  selected,
  onSelect,
  canEdit,
  onAdd,
}: {
  categories: Category[]
  selected: string | 'all'
  onSelect: (id: string | 'all') => void
  canEdit: boolean
  onAdd: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onAdd(name)
    setSubmitting(false)
    setName('')
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect('all')}
        className={cn(
          'rounded-full border px-3 py-1 text-sm',
          selected === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        )}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            selected === c.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            !c.is_active && 'opacity-50',
          )}
        >
          {c.name}
        </button>
      ))}
      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              + Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? 'Adding…' : 'Add'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
