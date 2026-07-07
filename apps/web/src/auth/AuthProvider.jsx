import { createContext, useContext, useMemo } from 'react'
import { loginUrl, logoutUrl } from './authConfig'

const AuthContext = createContext(null)

// SSO server-side: login/logout chỉ là điều hướng trình duyệt tới endpoint API.
export function AuthProvider({ children }) {
  const value = useMemo(
    () => ({
      login: () => {
        window.location.href = loginUrl
      },
      logout: () => {
        window.location.href = logoutUrl
      },
    }),
    [],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}
