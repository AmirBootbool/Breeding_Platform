import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  mobileSidebarOpen: boolean
  collapsedNavGroups: string[]
  activeProgramId: number | ''
  commandPaletteOpen: boolean

  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  toggleNavGroup: (id: string) => void
  setActiveProgramId: (id: number | '') => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mobileSidebarOpen: false,
      collapsedNavGroups: [],
      activeProgramId: '',
      commandPaletteOpen: false,

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
      name: 'wbp-ui-state',
      partialize: (state) => ({
        collapsedNavGroups: state.collapsedNavGroups,
        activeProgramId: state.activeProgramId,
      }),
    }
  )
)
