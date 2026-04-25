import { useEffect, useState } from 'react'

interface AdminSessionStatusResponse {
  ok: boolean
  scope: string
  expiresAt: string
}

interface AdminCarePackageItem {
  carePackage: {
    id: string
    status: string
    senderName: string | null
    comment: string | null
    quotaMode: string
    declaredBytes: number
    committedBytes: number
    fileCount: number
    createdAt: string
    updatedAt: string
    completedAt: string | null
    tracking: {
      ipAddress: string | null
      userAgent: string | null
      cf: {
        country: string | null
        region: string | null
        city: string | null
        timezone: string | null
        colo: string | null
      } | null
    }
  }
  files: Array<{
    id: string
    relativePath: string
    fileName: string
    objectKey: string
    sizeBytes: number
    status: string
    uploadedBytes: number
    completedParts: number
    createdAt: string
    updatedAt: string
    completedAt: string | null
  }>
}

interface AdminCarePackageListResponse {
  items: AdminCarePackageItem[]
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      message?: string
      error?: {
        message?: string
        details?: { errors?: string[] }
      }
      details?: { errors?: string[] }
    }

    if (payload?.error?.details?.errors?.length) {
      return payload.error.details.errors.join(', ')
    }

    if (payload?.details?.errors?.length) {
      return payload.details.errors.join(', ')
    }

    if (payload?.error?.message) {
      return payload.error.message
    }

    if (payload?.message) {
      return payload.message
    }
  } catch {
    // Fall through to the status text below.
  }

  return response.statusText || 'Request failed.'
}

export default function AdminApp() {
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null)
  const [items, setItems] = useState<AdminCarePackageItem[]>([])
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isLoadingTrail, setIsLoadingTrail] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/session', {
        credentials: 'same-origin',
      })

      if (!response.ok) {
        setIsAuthenticated(false)
        setSessionExpiresAt(null)
        setItems([])
        setAuthState('ready')
        return
      }

      const payload = (await response.json()) as AdminSessionStatusResponse
      setIsAuthenticated(true)
      setSessionExpiresAt(payload.expiresAt)
      setAuthState('ready')
      setErrorMessage(null)
      await loadTrail()
    })()
  }, [])

  async function loadTrail() {
    setIsLoadingTrail(true)

    try {
      const response = await fetch('/api/admin/care-packages?limit=24', {
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response))
      }

      const payload = (await response.json()) as AdminCarePackageListResponse
      setItems(payload.items)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load admin trail.')
    } finally {
      setIsLoadingTrail(false)
    }
  }

  async function onLogin() {
    if (isAuthenticating) {
      return
    }

    setIsAuthenticating(true)

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password,
        }),
      })

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response))
      }

      const payload = (await response.json()) as AdminSessionStatusResponse
      setIsAuthenticated(true)
      setSessionExpiresAt(payload.expiresAt)
      setErrorMessage(null)
      setPassword('')
      await loadTrail()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      setIsAuthenticating(false)
      setAuthState('ready')
    }
  }

  async function onSignOut() {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })

    setIsAuthenticated(false)
    setSessionExpiresAt(null)
    setItems([])
    setErrorMessage(null)
  }

  const totalFiles = items.reduce((sum, item) => sum + item.carePackage.fileCount, 0)
  const totalBytes = items.reduce((sum, item) => sum + item.carePackage.committedBytes, 0)

  if (authState === 'checking') {
    return (
      <main className="app-shell">
        <section className="app-column">
          <header className="page-header">
            <p className="page-eyebrow">Slack Classics</p>
            <h1>Admin</h1>
          </header>
          <section className="upload-panel admin-login-panel">
            <strong>Checking session...</strong>
          </section>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell">
        <section className="app-column">
          <header className="page-header">
            <p className="page-eyebrow">Slack Classics</p>
            <h1>Admin</h1>
          </header>

          <section className="upload-panel admin-login-panel">
            <div className="field-stack">
              <label>
                <span>Password</span>
                <input
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void onLogin()
                    }
                  }}
                  type="password"
                  value={password}
                />
              </label>
            </div>

            {errorMessage ? (
              <section className="status-panel is-error">
                <strong>{errorMessage}</strong>
              </section>
            ) : null}

            <div className="submit-row">
              <button className="submit-button" disabled={isAuthenticating || !password.trim()} onClick={onLogin} type="button">
                {isAuthenticating ? 'Checking...' : 'Enter'}
              </button>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-column">
        <header className="page-header">
          <p className="page-eyebrow">Slack Classics</p>
          <h1>Admin</h1>
        </header>

        <section className="upload-panel admin-toolbar-panel">
          <div className="admin-toolbar">
            <div className="admin-stat-grid">
              <div className="admin-stat-card">
                <span>Packages</span>
                <strong>{items.length}</strong>
              </div>
              <div className="admin-stat-card">
                <span>Files</span>
                <strong>{totalFiles}</strong>
              </div>
              <div className="admin-stat-card">
                <span>Bytes</span>
                <strong>{formatBytes(totalBytes)}</strong>
              </div>
            </div>

            <div className="admin-toolbar-actions">
              <button className="ghost-button" disabled={isLoadingTrail} onClick={() => void loadTrail()} type="button">
                {isLoadingTrail ? 'Refreshing...' : 'Refresh'}
              </button>
              <button className="ghost-button" onClick={() => void onSignOut()} type="button">
                Sign out
              </button>
            </div>
          </div>

          <div className="admin-session-meta">
            <span>{sessionExpiresAt ? `Session until ${formatDate(sessionExpiresAt)}` : ''}</span>
          </div>
        </section>

        {errorMessage ? (
          <section className="status-panel is-error">
            <strong>{errorMessage}</strong>
          </section>
        ) : null}

        <section className="admin-trail">
          {items.map((item) => (
            <article className="admin-package-card" key={item.carePackage.id}>
              <div className="admin-package-topline">
                <strong>{item.carePackage.senderName || item.carePackage.id}</strong>
                <span>{item.carePackage.status}</span>
              </div>

              <div className="admin-package-meta">
                <span>{formatDate(item.carePackage.createdAt)}</span>
                <span>{item.carePackage.fileCount} files</span>
                <span>{formatBytes(item.carePackage.committedBytes || item.carePackage.declaredBytes)}</span>
              </div>

              {item.carePackage.comment ? <p className="admin-package-comment">{item.carePackage.comment}</p> : null}

              <div className="admin-package-tracking">
                <span>{item.carePackage.tracking.cf?.city || item.carePackage.tracking.cf?.country || '—'}</span>
                <span>{item.carePackage.tracking.ipAddress || '—'}</span>
                <code>{item.carePackage.id}</code>
              </div>

              <ul className="admin-file-list">
                {item.files.map((file) => (
                  <li key={file.id}>
                    <span>{file.relativePath}</span>
                    <span>{formatBytes(file.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
