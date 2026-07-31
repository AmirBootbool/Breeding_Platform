import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  username: string | null
  role: string | null
  setAuth: (token: string, username: string, role?: string) => void
  clearAuth: () => void
  isAuthenticated: boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,

      setAuth: (token, username, role = 'breeder') =>
        set({ token, username, role, isAuthenticated: true }),

      clearAuth: () =>
        set({ token: null, username: null, role: null, isAuthenticated: false }),
    }),
    {
      name: 'wbp-auth',
    }
  )
)
