import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  theme: 'dark' | 'sunlight'
  mobileSidebarOpen: boolean
  collapsedNavGroups: string[]
  activeProgramId: number | ''
  commandPaletteOpen: boolean

  setTheme: (theme: 'dark' | 'sunlight') => void
  toggleTheme: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  toggleNavGroup: (id: string) => void
  setActiveProgramId: (id: number | '') => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      mobileSidebarOpen: false,
      collapsedNavGroups: [],
      activeProgramId: '',
      commandPaletteOpen: false,

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'sunlight' : 'dark'
        document.documentElement.setAttribute('data-theme', next)
        set({ theme: next })
      },

      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),

      toggleNavGroup: (id) =>
        set((state) => ({
          collapsedNavGroups: state.collapsedNavGroups.includes(id)
            ? state.collapsedNavGroups.filter((g) => g !== id)
            : [...state.collapsedNavGroups, id],
        })),

      setActiveProgramId: (id) => set({ activeProgramId: id }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
    }),
    {
      name: 'wbp-ui-theme',
      partialize: (state) => ({
        theme: state.theme,
        collapsedNavGroups: state.collapsedNavGroups,
        activeProgramId: state.activeProgramId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme || 'dark')
        }
      },
    }
  )
)
