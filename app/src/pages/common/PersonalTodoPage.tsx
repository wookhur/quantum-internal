import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, MessageSquare, Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  usePersonalTodos, useCreatePersonalTodo, useTogglePersonalTodo, useDeletePersonalTodo,
} from '@/hooks/usePersonalTodos'

export function PersonalTodoPage() {
  const { user } = useAuth()
  const ownerId = user?.id
  const { data: todos = [] } = usePersonalTodos(ownerId)
  const create = useCreatePersonalTodo()
  const toggle = useTogglePersonalTodo()
  const del = useDeletePersonalTodo()
  const [title, setTitle] = useState('')

  const add = () => {
    if (!title.trim() || !ownerId) return
    create.mutate({ ownerId, title: title.trim() }, { onSuccess: () => setTitle('') })
  }

  const openCount = todos.filter(t => !t.done).length

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">To-do</h1>
        <p className="text-sm text-muted-foreground mt-0.5">내 할일 목록 · 미완료 {openCount}개</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="할일 추가…"
          className="h-10"
        />
        <Button onClick={add} disabled={!title.trim() || create.isPending} className="gap-1.5 h-10">
          <Plus className="size-4" />추가
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {todos.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">할일이 없습니다. 직접 추가하거나, 메시지에서 우클릭 → “할일에 추가”로 담을 수 있어요.</p>}
          {todos.map(td => (
            <div key={td.id} className="flex items-center gap-3 px-4 py-3 group">
              <button
                type="button"
                onClick={() => ownerId && toggle.mutate({
                  id: td.id, ownerId, done: !td.done,
                  sourceRoomId: td.sourceRoomId,
                  sourceMessageId: td.sourceMessageId,
                  title: td.title,
                  completerName: user?.name,
                })}
                className={`size-5 rounded border flex items-center justify-center shrink-0 transition-colors ${td.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-gray-400'}`}
              >
                {td.done && <Check className="size-3.5" />}
              </button>
              <span className={`flex-1 text-sm whitespace-pre-wrap ${td.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {td.title}
                {td.sourceMessageId && (
                  <span title="메시지에서 추가됨"><MessageSquare className="inline size-3 ml-1.5 text-blue-400" /></span>
                )}
              </span>
              <Button
                size="sm" variant="ghost"
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={() => ownerId && del.mutate({ id: td.id, ownerId })}
              >
                <Trash2 className="size-3.5 text-red-400" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
