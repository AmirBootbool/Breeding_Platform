import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  token: string | null
  username: string | null
  role: string | null
  setAuth: (token: string, username: string, role?: string) => void
  clearAuth: () => void
  isAuthenticated: boolean
}

// H-1 Security: Use sessionStorage instead of localStorage for auth token storage.
// sessionStorage is:
//   - Scoped to the browser tab (cleared when tab/window closes, not on browser restart)
//   - Not accessible across tabs (reduces XSS blast radius — a compromise in one tab
//     does not expose tokens from other tabs or previous sessions)
//   - Still accessible to JavaScript on the same origin, so a strong CSP is also
//     required to reduce XSS risk further.
// Note: Users will need to log in again after closing the browser tab.
// If "remember me" persistence is needed in future, implement HttpOnly cookie auth instead.
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
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
