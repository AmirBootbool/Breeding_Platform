import { observations } from '../api/client'
import { offlineStorage, QueuedObservation } from './offlineStorage'
import { useNotificationStore } from '../store/notificationStore'

export type SyncStatus = 'online' | 'offline' | 'syncing'

export interface SyncResult {
  syncedCount: number
  failedCount: number
  errors: any[]
}

export interface SyncConflict {
  id: string
  clientId: string
  plotNumber: number | string
  traitName: string
  localValue: string | number
  serverValue: string | number
  localTimestamp: string
  serverTimestamp: string
}

class SyncManager {
  private status: SyncStatus = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  private listeners: ((status: SyncStatus, queueCount: number, conflictsCount: number) => void)[] = []
  private isSyncing = false
  private conflicts: SyncConflict[] = []

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
        useNotificationStore.getState().push({
          title: 'Offline Mode Active',
          text: 'Internet connection lost. Field observations will be saved locally in IndexedDB.',
          kind: 'sync',
        })
      })
    }
  }

  public getStatus(): SyncStatus {
    return this.status
  }

  public getQueueCount(): number {
    return offlineStorage.getQueueCount()
  }

  public getConflicts(): SyncConflict[] {
    return [...this.conflicts]
  }

  public addConflict(conflict: SyncConflict): void {
    this.conflicts = [...this.conflicts.filter(c => c.id !== conflict.id), conflict]
    this.notify()
  }

  public async resolveConflict(conflictId: string, resolution: 'local' | 'server'): Promise<void> {
    const conflict = this.conflicts.find(c => c.id === conflictId)
    if (!conflict) return

    if (resolution === 'server') {
      // Discard local queued record
      await offlineStorage.removeQueuedObservation(conflict.clientId)
    }
    // If 'local', leave in queue so next sync pushes it as override

    this.conflicts = this.conflicts.filter(c => c.id !== conflictId)
    this.notify()
  }

  public async resolveAllConflicts(resolution: 'local' | 'server'): Promise<void> {
    if (resolution === 'server') {
      for (const conflict of this.conflicts) {
        await offlineStorage.removeQueuedObservation(conflict.clientId)
      }
    }
    this.conflicts = []
    this.notify()
  }

  public subscribe(callback: (status: SyncStatus, queueCount: number, conflictsCount: number) => void): () => void {
    this.listeners.push(callback)
    callback(this.status, this.getQueueCount(), this.conflicts.length)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  private notify(): void {
    const count = this.getQueueCount()
    const conflictsCount = this.conflicts.length
    this.listeners.forEach(cb => cb(this.status, count, conflictsCount))
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
      const failedIndices = new Set(errors.map((e: any) => e.index))

      for (const [idx, item] of queue.entries()) {
        if (!failedIndices.has(idx)) {
          await offlineStorage.removeQueuedObservation(item.clientId)
        }
      }

      this.isSyncing = false
      this.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
      this.notify()

      if (createdCount > 0) {
        useNotificationStore.getState().push({
          title: 'Offline Sync Completed',
          text: `Successfully synced ${createdCount} queued field observation${createdCount === 1 ? '' : 's'}.`,
          kind: 'sync',
        })
      }

      if (errors.length > 0) {
        useNotificationStore.getState().push({
          title: 'Offline Sync Warning',
          text: `${errors.length} observation${errors.length === 1 ? '' : 's'} failed during sync.`,
          kind: 'sync',
        })
      }

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

      useNotificationStore.getState().push({
        title: 'Offline Sync Failed',
        text: `Failed to sync ${queue.length} observation(s): ${(err as Error).message || 'Server error'}`,
        kind: 'sync',
      })

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

if (typeof window !== 'undefined') {
  ;(window as any).syncManager = syncManager
}
