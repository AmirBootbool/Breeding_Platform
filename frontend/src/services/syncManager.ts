import { observations } from '../api/client'
import { offlineStorage, QueuedObservation } from './offlineStorage'

export type SyncStatus = 'online' | 'offline' | 'syncing'

export interface SyncResult {
  syncedCount: number
  failedCount: number
  errors: any[]
}

class SyncManager {
  private status: SyncStatus = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  private listeners: ((status: SyncStatus, queueCount: number) => void)[] = []
  private isSyncing = false

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.status = 'online'
        this.notify()
        this.autoSync()
      })

      window.addEventListener('offline', () => {
        this.status = 'offline'
        this.notify()
      })
    }
  }

  public getStatus(): SyncStatus {
    return this.status
  }

  public getQueueCount(): number {
    return offlineStorage.getQueueCount()
  }

  public subscribe(callback: (status: SyncStatus, queueCount: number) => void): () => void {
    this.listeners.push(callback)
    callback(this.status, this.getQueueCount())
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  private notify(): void {
    const count = this.getQueueCount()
    this.listeners.forEach(cb => cb(this.status, count))
  }

  public async autoSync(): Promise<SyncResult | null> {
    if (this.status === 'offline' || this.isSyncing) return null
    const count = this.getQueueCount()
    if (count === 0) return null
    return this.syncNow()
  }

  public async syncNow(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { syncedCount: 0, failedCount: 0, errors: [] }
    }

    const queue: QueuedObservation[] = offlineStorage.getQueuedObservations()
    if (queue.length === 0) {
      return { syncedCount: 0, failedCount: 0, errors: [] }
    }

    this.isSyncing = true
    this.status = 'syncing'
    this.notify()

    const payload = queue.map(q => ({
      plot: q.plot,
      variable: q.variable,
      value_numeric: q.value_numeric,
      value_text: q.value_text || '',
      value_date: q.value_date,
      observation_time: q.observation_time || new Date().toISOString(),
      notes: q.notes || '',
    }))

    try {
      const res = await observations.bulkCreate({ observations: payload })
      const createdCount = res.created?.length ?? 0
      const errors = res.errors ?? []

      if (errors.length === 0) {
        offlineStorage.clearQueuedObservations()
      } else {
        const failedIndices = new Set(errors.map((e: any) => e.index))
        const remaining = queue.filter((_, idx) => failedIndices.has(idx))
        offlineStorage.clearQueuedObservations()
        remaining.forEach(item => offlineStorage.queueObservation(item))
      }

      this.isSyncing = false
      this.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
      this.notify()

      return {
        syncedCount: createdCount,
        failedCount: errors.length,
        errors,
      }
    } catch (err) {
      console.error('Error during offline sync:', err)
      this.isSyncing = false
      this.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
      this.notify()
      return {
        syncedCount: 0,
        failedCount: queue.length,
        errors: [err],
      }
    }
  }

  public exportQueueToCsv(): void {
    const queue = offlineStorage.getQueuedObservations()
    if (queue.length === 0) return

    const headers = ['clientId', 'plot', 'variable', 'variable_name', 'value_numeric', 'value_text', 'value_date', 'observation_time', 'notes']
    const rows = queue.map(q => [
      `"${q.clientId}"`,
      q.plot,
      q.variable,
      `"${q.variable_name || ''}"`,
      q.value_numeric !== null ? q.value_numeric : '',
      `"${q.value_text || ''}"`,
      `"${q.value_date || ''}"`,
      `"${q.observation_time}"`,
      `"${(q.notes || '').replace(/"/g, '""')}"`,
    ].join(','))

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offline_observations_backup_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }
}

export const syncManager = new SyncManager()
