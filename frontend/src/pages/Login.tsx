import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, ApiError } from '../api/client'
import { useAuthStore } from '../store/authStore'
import './Login.css'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await login(username, password)
      setAuth(token, username)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError('Invalid username or password.')
      } else {
        setError('Unable to connect to the server.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Animated background blobs */}
      <div className="login-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="login-card card-glass fade-in">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">🌾</div>
          <h1 className="login-title">Wheat Breeding Platform</h1>
          <p className="login-subtitle text-muted">
            Sign in to manage your breeding programs
          </p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="form-group">
            <label htmlFor="username" className="form-label">Username</label>
            <input
              id="username"
              type="text"
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="login-footer text-xs text-muted">
          Use the credentials created with{' '}
          <code className="font-mono">python manage.py createsuperuser</code>
        </p>
      </div>
    </div>
  )
}
