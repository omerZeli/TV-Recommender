import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: number
  email: string
  name: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('authToken')
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Verify token on mount
  useEffect(() => {
    if (token) {
      verifyToken().catch((err) => {
        console.error('Token verification failed:', err)
      })
    }
  }, [])

  const verifyToken = async (tokenToVerify?: string) => {
    const tokenValue = tokenToVerify || token
    try {
      console.log('Verifying token:', tokenValue?.substring(0, 20) + '...')
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokenValue}`,
        },
      })
      console.log('Auth/me response status:', response.status)
      if (response.ok) {
        const userData = await response.json()
        console.log('User data loaded:', userData)
        setUser(userData)
      } else {
        console.log('Token verification failed with status:', response.status)
        setToken(null)
        localStorage.removeItem('authToken')
      }
    } catch (err) {
      console.error('Token verification error:', err)
      setToken(null)
      localStorage.removeItem('authToken')
    }
  }

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Login failed')
      }

      const data = await response.json()
      console.log('Login response:', data)
      const accessToken = data.accessToken
      setToken(accessToken)
      localStorage.setItem('authToken', accessToken)
      await verifyToken(accessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Registration failed')
      }

      const data = await response.json()
      console.log('Register response:', data)
      const accessToken = data.accessToken
      setToken(accessToken)
      localStorage.setItem('authToken', accessToken)
      await verifyToken(accessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
  }

  const clearError = () => {
    setError(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, error, login, register, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
