import { offlineDb, OfflineTrialPackage } from './offlineDb'

export interface QueuedObservation {
  clientId: string
  trialId?: number
  trialCode?: string
  plot: number
  plotNumber?: number
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

  async queueObservation(obs: Omit<QueuedObservation, 'clientId' | 'recordedAt'>): Promise<QueuedObservation> {
    const queue = this.getQueuedObservations()
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

    // Await the IndexedDB mirror so writes to the two stores stay ordered
    // relative to each other (a fire-and-forget write here could otherwise
    // commit after a later clear/remove and leave IndexedDB out of sync
    // with localStorage, which is what the UI actually reads from).
    try {
      await offlineDb.queueObservation({
        trialId: obs.trialId || 0,
        trialCode: obs.trialCode,
        plot: obs.plot,
        plotNumber: obs.plotNumber,
        variable: obs.variable,
        variableName: obs.variable_name,
        valueNumeric: obs.value_numeric,
        valueText: obs.value_text,
        valueDate: obs.value_date,
        observationTime: obs.observation_time,
        notes: obs.notes,
      })
    } catch (e) {
      console.error(e)
    }

    return item
  },

  async removeQueuedObservation(clientId: string): Promise<void> {
    const queue = this.getQueuedObservations().filter(q => q.clientId !== clientId)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch (e) {
      console.error('Failed to remove queued observation:', e)
    }
    try {
      await offlineDb.removeQueuedItem(clientId)
    } catch (e) {
      console.error(e)
    }
  },

  async clearQueuedObservations(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear queue:', e)
    }
    try {
      await offlineDb.clearQueue()
    } catch (e) {
      console.error(e)
    }
  },

  // ---- Trial Data Package Caching ----
  async saveTrialPackage(pkg: OfflineTrialPackage): Promise<void> {
    try {
      localStorage.setItem(`${METADATA_PREFIX}${pkg.trialId}`, JSON.stringify({
        cachedAt: Date.now(),
        data: pkg,
      }))
    } catch (e) {
      console.warn('localStorage quota reached, relying on IndexedDB:', e)
    }
    await offlineDb.saveTrialPackage(pkg)
  },

  async getTrialPackage(trialId: number): Promise<OfflineTrialPackage | null> {
    const idbResult = await offlineDb.getTrialPackage(trialId)
    if (idbResult) return idbResult

    try {
      const raw = localStorage.getItem(`${METADATA_PREFIX}${trialId}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.data ?? null
    } catch {
      return null
    }
  },

  async listCachedTrials(): Promise<OfflineTrialPackage[]> {
    return offlineDb.listCachedTrials()
  },

  async removeCachedTrial(trialId: number): Promise<void> {
    try {
      localStorage.removeItem(`${METADATA_PREFIX}${trialId}`)
    } catch (e) {
      console.error(e)
    }
    await offlineDb.removeCachedTrial(trialId)
  }
}
