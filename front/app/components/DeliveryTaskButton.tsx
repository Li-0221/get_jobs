'use client'

import { BiPlay, BiStop } from 'react-icons/bi'
import { Button } from '@/components/ui/button'
import type { useDeliveryTask } from '@/hooks/use-delivery-task'

type Props = {
  task: ReturnType<typeof useDeliveryTask>
  checkingLogin: boolean
  isLoggedIn: boolean
  loginLabel: string
  onStart?: () => void
}

export default function DeliveryTaskButton({ task, checkingLogin, isLoggedIn, loginLabel, onStart }: Props) {
  const active = task.state === 'running' || task.state === 'stopping'
  const pending = task.state === 'loading' || task.state === 'starting' || task.state === 'stopping'
  const unknown = task.state === 'unknown'
  // A running task must retain its stop control even if the login stream is down.
  const disabled = pending || (!active && !unknown && (checkingLogin || !isLoggedIn))
  const label = task.state === 'loading' ? '获取任务状态中...'
    : task.state === 'starting' ? '正在启动...'
    : task.state === 'stopping' ? '正在停止...'
    : unknown ? '重试获取状态'
    : active ? '停止投递'
    : checkingLogin ? '检查登录中...'
    : !isLoggedIn ? loginLabel : '开始投递'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          if (unknown) void task.refresh()
          else if (active) void task.stop()
          else if (onStart) onStart()
          else void task.start()
        }}
        className={`rounded-full px-4 shadow-lg transition-all duration-300 ${disabled
          ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
          : active
            ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white hover:shadow-xl hover:scale-105'
            : 'bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white hover:shadow-xl hover:scale-105'}`}
      >
        {active ? <BiStop className="mr-1" /> : <BiPlay className="mr-1" />}{label}
      </Button>
      {task.error && <span role="status" className="text-xs text-red-500">{task.error}</span>}
    </div>
  )
}
