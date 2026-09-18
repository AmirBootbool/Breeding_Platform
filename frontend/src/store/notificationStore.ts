import { create } from 'zustand'

export interface NotificationItem {
  id: string
  text: string
  title?: string
  ts: number
  read: boolean
  kind: 'sync' | 'stock' | 'import' | 'qc'
}

interface NotificationState {
  items: NotificationItem[]
  push: (n: Omit<NotificationItem, 'id' | 'ts' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
  unreadCount: () => number
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],

  push: (n) => {
    const item: NotificationItem = {
      ...n,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `notif-${Date.now()}-${Math.random()}`,
      ts: Date.now(),
      read: false,
    }
    set((state) => ({
      // Keep last 50 notifications, latest first
      items: [item, ...state.items].slice(0, 50),
    }))
  },

  markAllRead: () => {
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true })),
    }))
  },

  markRead: (id) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }))
  },

  clearAll: () => {
    set({ items: [] })
  },

  unreadCount: () => {
    return get().items.filter((item) => !item.read).length
  },
}))
