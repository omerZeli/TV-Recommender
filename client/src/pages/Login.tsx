import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import styles from './Auth.module.css'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading, error, clearError } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      console.error('Login error:', err)
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <h1>TV Recommender</h1>
        <h2>Login</h2>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <button type="submit" disabled={isLoading} className={styles.button}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className={styles.link}>
          Don't have an account?{' '}
          <a href="/register" onClick={(e) => {
            e.preventDefault()
            navigate('/register')
          }}>
            Register here
          </a>
        </p>
      </div>
    </div>
  )
}
