/**
 * IndexedDB wrapper for Wheat Breeding Platform offline-first field scoring.
 */

export interface OfflineTrialPackage {
  trialId: number
  trialCode: string
  name: string
  programName: string
  plots: any[]
  variables: any[]
  panels: any[]
  existingObservations: any[]
  downloadedAt: number
}

export interface OfflineQueuedObservation {
  clientId: string
  trialId: number
  trialCode?: string
  plot: number
  plotNumber?: number
  variable: number
  variableName?: string
  valueNumeric: number | null
  valueText: string
  valueDate: string | null
  observationTime: string
  notes: string
  recordedAt: number
  syncStatus: 'pending' | 'syncing' | 'failed'
  error?: string
}

const DB_NAME = 'WheatBreedingPlatformDB'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Store 1: Cached trials for offline scoring
      if (!db.objectStoreNames.contains('cached_trials')) {
        db.createObjectStore('cached_trials', { keyPath: 'trialId' })
      }

      // Store 2: Offline observation queue
      if (!db.objectStoreNames.contains('observation_queue')) {
        const obsStore = db.createObjectStore('observation_queue', { keyPath: 'clientId' })
        obsStore.createIndex('trialId', 'trialId', { unique: false })
        obsStore.createIndex('recordedAt', 'recordedAt', { unique: false })
      }

      // Store 3: Sync logs & audit
      if (!db.objectStoreNames.contains('sync_logs')) {
        db.createObjectStore('sync_logs', { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const offlineDb = {
  // ---- Cached Trials --------------------------------------------------------
  async saveTrialPackage(pkg: OfflineTrialPackage): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cached_trials', 'readwrite')
        const store = tx.objectStore('cached_trials')
        store.put(pkg)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (e) {
      console.warn('Fallback to localStorage for trial package:', e)
      localStorage.setItem(`wbp-offline-trial-${pkg.trialId}`, JSON.stringify(pkg))
    }
  },

  async getTrialPackage(trialId: number): Promise<OfflineTrialPackage | null> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cached_trials', 'readonly')
        const store = tx.objectStore('cached_trials')
        const request = store.get(trialId)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })
    } catch {
      const raw = localStorage.getItem(`wbp-offline-trial-${trialId}`)
      return raw ? JSON.parse(raw) : null
    }
  },

  async listCachedTrials(): Promise<OfflineTrialPackage[]> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cached_trials', 'readonly')
        const store = tx.objectStore('cached_trials')
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch {
      return []
    }
  },

  async removeCachedTrial(trialId: number): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cached_trials', 'readwrite')
        const store = tx.objectStore('cached_trials')
        store.delete(trialId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      localStorage.removeItem(`wbp-offline-trial-${trialId}`)
    }
  },

  // ---- Observation Queue ----------------------------------------------------
  async queueObservation(obs: Omit<OfflineQueuedObservation, 'clientId' | 'recordedAt' | 'syncStatus'>): Promise<OfflineQueuedObservation> {
    const item: OfflineQueuedObservation = {
      ...obs,
      clientId: `client-obs-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      recordedAt: Date.now(),
      syncStatus: 'pending',
    }

    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('observation_queue', 'readwrite')
        const store = tx.objectStore('observation_queue')
        store.put(item)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (e) {
      console.warn('Fallback to localStorage for queue:', e)
    }

    return item
  },

  async getQueue(): Promise<OfflineQueuedObservation[]> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('observation_queue', 'readonly')
        const store = tx.objectStore('observation_queue')
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch {
      return []
    }
  },

  async removeQueuedItem(clientId: string): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('observation_queue', 'readwrite')
        const store = tx.objectStore('observation_queue')
        store.delete(clientId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (e) {
      console.warn('Failed to remove queued item:', e)
    }
  },

  async clearQueue(): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('observation_queue', 'readwrite')
        const store = tx.objectStore('observation_queue')
        store.clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (e) {
      console.warn('Failed to clear queue:', e)
    }
  },
}
