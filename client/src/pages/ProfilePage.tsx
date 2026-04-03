import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CountrySelect } from '../components/CountrySelect'
import styles from './Auth.module.css'

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [country, setCountry] = useState(user?.country ?? '')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setIsSaving(true)

    const data: { name?: string; email?: string; password?: string; country?: string } = {}
    if (name !== user?.name) data.name = name
    if (email !== user?.email) data.email = email
    if (password) data.password = password
    if (country !== (user?.country ?? '')) data.country = country

    if (Object.keys(data).length === 0) {
      setIsSaving(false)
      return
    }

    try {
      await updateUser(data)
      setPassword('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <h1>Profile</h1>
        <h2>Edit your details</h2>

        {error && <div className={styles.error}>{error}</div>}
        {success && (
          <div className={styles.error} style={{ background: '#efe', color: '#363', borderLeftColor: '#363' }}>
            Profile updated successfully.
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSaving}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="profile-country">Country</label>
            <CountrySelect
              id="profile-country"
              value={country}
              onChange={setCountry}
              isDisabled={isSaving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="profile-password">New Password</label>
            <input
              id="profile-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSaving}
              placeholder="Leave blank to keep current"
            />
            <small>Minimum 6 characters</small>
          </div>

          <button className={styles.button} type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        <div className={styles.link}>
          <a onClick={() => navigate(-1)}>← Back</a>
        </div>
      </div>
    </div>
  )
}
