export interface QueuedObservation {
  clientId: string
  plot: number
  variable: number
  variable_name?: string
  value_numeric: number | null
  value_text: string
  value_date: string | null
  observation_time: string
  notes: string
  recordedAt: number
}

const STORAGE_KEY = 'wbp-offline-observation-queue'
const METADATA_PREFIX = 'wbp-offline-trial-meta-'

export const offlineStorage = {
  getQueuedObservations(): QueuedObservation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  },

  getQueueCount(): number {
    return this.getQueuedObservations().length
  },

  queueObservation(obs: Omit<QueuedObservation, 'clientId' | 'recordedAt'>): QueuedObservation {
    const queue = this.getQueuedObservations()
    // Check if an observation for this plot & variable already exists in queue; if so, update it
    const existingIdx = queue.findIndex(q => q.plot === obs.plot && q.variable === obs.variable)

    const item: QueuedObservation = {
      ...obs,
      clientId: existingIdx >= 0 ? queue[existingIdx].clientId : `client-obs-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      recordedAt: Date.now(),
    }

    if (existingIdx >= 0) {
      queue[existingIdx] = item
    } else {
      queue.push(item)
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch (e) {
      console.error('Failed to persist observation in localStorage:', e)
    }

    return item
  },

  removeQueuedObservation(clientId: string): void {
    const queue = this.getQueuedObservations().filter(q => q.clientId !== clientId)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch (e) {
      console.error('Failed to remove queued observation:', e)
    }
  },

  clearQueuedObservations(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear queue:', e)
    }
  },

  cacheTrialData(trialId: number, data: any): void {
    try {
      localStorage.setItem(`${METADATA_PREFIX}${trialId}`, JSON.stringify({
        cachedAt: Date.now(),
        data,
      }))
    } catch (e) {
      console.error('Failed to cache trial metadata:', e)
    }
  },

  getCachedTrialData(trialId: number): any | null {
    try {
      const raw = localStorage.getItem(`${METADATA_PREFIX}${trialId}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.data ?? null
    } catch {
      return null
    }
  }
}
