'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/lib/api'

type Platform = 'boss' | 'liepin' | '51job' | 'zhilian'
type TaskState = 'loading' | 'unknown' | 'idle' | 'starting' | 'running' | 'stopping'

const POLL_MS = 3000
// /start schedules an asynchronous worker; isRunning can briefly still be false.
const START_CONFIRM_MS = 10000
const REQUEST_TIMEOUT_MS = 10000

export function useDeliveryTask(platform: Platform, apiBase = API_BASE) {
  const [state, setState] = useState<TaskState>('loading')
  const [error, setError] = useState<string | null>(null)
  const currentState = useRef<TaskState>('loading')
  const mounted = useRef(false)
  const busy = useRef(false)
  const revision = useRef(0)
  const statusRequest = useRef<AbortController | null>(null)
  const actionRequest = useRef<AbortController | null>(null)
  const startDeadline = useRef(0)
  const endpoint = `${apiBase}/api/${platform}`

  const updateState = useCallback((next: TaskState) => {
    currentState.current = next
    setState(next)
  }, [])

  const cancelStatusRequest = useCallback(() => {
    ++revision.current
    statusRequest.current?.abort()
    statusRequest.current = null
  }, [])

  const refresh = useCallback(async () => {
    if (!mounted.current || busy.current || statusRequest.current) return null
    const controller = new AbortController()
    statusRequest.current = controller
    const requestRevision = ++revision.current
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${endpoint}/status`, {
        cache: 'no-store', signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (typeof data.isRunning !== 'boolean') throw new Error('任务状态响应无效')
      if (!mounted.current || revision.current !== requestRevision) return null
      const isRunning = data.isRunning === true
      setError(null)
      if (!isRunning && Date.now() < startDeadline.current) return false
      startDeadline.current = 0
      // A successful stop response only acknowledges the request, not completion.
      updateState(isRunning
        ? currentState.current === 'stopping' ? 'stopping' : 'running'
        : 'idle')
      return isRunning
    } catch {
      if (mounted.current && revision.current === requestRevision) {
        setError('无法获取任务状态，请重试')
        if (currentState.current === 'loading') updateState('unknown')
      }
      return null
    } finally {
      window.clearTimeout(timeout)
      if (statusRequest.current === controller) statusRequest.current = null
    }
  }, [endpoint, updateState])

  const execute = useCallback(async (action: 'start' | 'stop') => {
    if (!mounted.current || busy.current) return { success: false, message: '请求处理中', cancelled: true }
    busy.current = true
    cancelStatusRequest()
    const previous = currentState.current
    startDeadline.current = 0
    updateState(action === 'start' ? 'starting' : 'stopping')
    setError(null)
    const controller = new AbortController()
    actionRequest.current = controller
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let result = { success: true, message: '', cancelled: false }
    try {
      const response = await fetch(`${endpoint}/${action}`, { method: 'POST', signal: controller.signal })
      const data = await response.json()
      if (!mounted.current || actionRequest.current !== controller) return { success: false, message: '页面已离开', cancelled: true }
      if (action === 'start' && (data.status === 'running' || data.status === 'already_running')) {
        updateState('running')
      } else if (response.ok && data.success === true) {
        if (action === 'start') startDeadline.current = Date.now() + START_CONFIRM_MS
      } else {
        throw new Error(data.message || `${action === 'start' ? '启动' : '停止'}投递失败`)
      }
    } catch (cause) {
      result = { success: false, message: cause instanceof Error && cause.name !== 'AbortError'
        ? cause.message : '请求未完成，请确认后台任务状态',
        cancelled: !mounted.current || actionRequest.current !== controller }
      if (!result.cancelled) {
        updateState(previous === 'running' || previous === 'stopping' ? previous : 'unknown')
      }
    } finally {
      window.clearTimeout(timeout)
      if (actionRequest.current === controller) busy.current = false
    }
    // Invalidate optimistic state after failures too: the server may have accepted
    // a command even when its response never reached this browser.
    if (mounted.current && actionRequest.current === controller) {
      await refresh()
      if (mounted.current && actionRequest.current === controller) {
        if (!result.success) setError(result.message)
        actionRequest.current = null
      } else {
        result.cancelled = true
      }
    } else {
      result.cancelled = true
    }
    return result
  }, [cancelStatusRequest, endpoint, refresh, updateState])

  useEffect(() => {
    mounted.current = true
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    // React also reactivates this effect when a cached Next.js page is revisited.
    void refresh()
    const interval = window.setInterval(syncWhenVisible, POLL_MS)
    window.addEventListener('focus', syncWhenVisible)
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      mounted.current = false
      cancelStatusRequest()
      actionRequest.current?.abort()
      statusRequest.current = null
      actionRequest.current = null
      busy.current = false
      window.clearInterval(interval)
      window.removeEventListener('focus', syncWhenVisible)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [cancelStatusRequest, refresh])

  const start = useCallback(() => execute('start'), [execute])
  const stop = useCallback(() => execute('stop'), [execute])
  return { state, error, refresh, start, stop }
}
