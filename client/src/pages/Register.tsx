import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import styles from './Auth.module.css'

export function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const { register, isLoading, error, clearError } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setFormError(null)

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    try {
      await register(name, email, password)
      navigate('/')
    } catch (err) {
      console.error('Registration error:', err)
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <h1>TV Recommender</h1>
        <h2>Create Account</h2>

        {error && <div className={styles.error}>{error}</div>}
        {formError && <div className={styles.error}>{formError}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
              minLength={2}
              maxLength={60}
            />
          </div>

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
              minLength={8}
            />
            <small>At least 8 characters</small>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={8}
            />
          </div>

          <button type="submit" disabled={isLoading} className={styles.button}>
            {isLoading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className={styles.link}>
          Already have an account?{' '}
          <a href="/login" onClick={(e) => {
            e.preventDefault()
            navigate('/login')
          }}>
            Login here
          </a>
        </p>
      </div>
    </div>
  )
}
