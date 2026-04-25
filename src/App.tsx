import { useEffect, useRef, useState } from 'react'
import AdminApp from './AdminApp'
import './App.css'

type Mode = 'anon' | 'invite'
type Visibility = 'private' | 'community' | 'peep'
type UploadStrategy = 'direct' | 'multipart'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface PublicConfig {
  turnstileRequired: boolean
  turnstileSiteKey: string | null
  limits: {
    directUploadMaxBytes: number
    multipartChunkSizeBytes: number
  }
}

interface SelectedFile {
  file: File
  relativePath: string
  key: string
}

interface SessionFile {
  id: string
  relativePath: string
  fileName: string
  sizeBytes: number
  uploadStrategy: UploadStrategy
  partSizeBytes: number | null
}

interface SessionResponse {
  carePackage: {
    id: string
  }
  files: SessionFile[]
}

interface CompleteSessionResponse {
  carePackage: {
    id: string
    status: string
    committedBytes: number
  }
}

interface TurnstileRenderOptions {
  sitekey: string
  execution?: 'render' | 'execute'
  callback?: (token: string) => void
  'error-callback'?: (code?: string) => void
  'expired-callback'?: () => void
}

interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string
  execute: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let turnstileScriptPromise: Promise<void> | null = null

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function createFileKey(file: File, relativePath: string) {
  return `${relativePath}::${file.size}::${file.lastModified}`
}

function getRelativePath(file: File) {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

function buildComment({
  mode,
  note,
  socialHandle,
  externalLink,
  visibility,
}: {
  mode: Mode
  note: string
  socialHandle: string
  externalLink: string
  visibility: Visibility
}) {
  const lines = [note.trim()]

  if (mode === 'invite') {
    if (socialHandle.trim()) {
      lines.push(`Social: ${socialHandle.trim()}`)
    }

    if (externalLink.trim()) {
      lines.push(`Link: ${externalLink.trim()}`)
    }

    lines.push(`Visibility: ${visibility}`)
  }

  const comment = lines.filter(Boolean).join('\n')
  return comment || null
}

function ensureTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve()
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`)

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile.'))
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
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
    // Ignore JSON parsing failures and fall back to status text.
  }

  return response.statusText || 'Request failed.'
}

function InboxApp() {
  const [mode, setMode] = useState<Mode>('anon')
  const [visibility, setVisibility] = useState<Visibility>('community')
  const [accessCode, setAccessCode] = useState('')
  const [senderName, setSenderName] = useState('Deano')
  const [socialHandle, setSocialHandle] = useState('')
  const [externalLink, setExternalLink] = useState('')
  const [note, setNote] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progressBytes, setProgressBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [carePackageId, setCarePackageId] = useState<string | null>(null)
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetIdRef = useRef<string | null>(null)
  const turnstileTokenResolverRef = useRef<((token: string) => void) | null>(null)
  const turnstileTokenRejectRef = useRef<((error: Error) => void) | null>(null)

  const normalizedCode = accessCode.trim().toLowerCase()
  const invitedUnlocked = mode === 'invite' && normalizedCode === 'deano'
  const totalSelectedBytes = selectedFiles.reduce((sum, entry) => sum + entry.file.size, 0)
  const isUploading = uploadState === 'uploading'

  useEffect(() => {
    let cancelled = false

    async function loadPublicConfig() {
      try {
        const response = await fetch('/api/public-config')
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response))
        }

        const config = (await response.json()) as PublicConfig
        if (!cancelled) {
          setPublicConfig(config)
          setConfigError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : 'Unable to load app config.')
        }
      }
    }

    void loadPublicConfig()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const siteKey = publicConfig?.turnstileSiteKey ?? null

    if (!publicConfig?.turnstileRequired || !siteKey || !turnstileContainerRef.current) {
      return
    }

    let cancelled = false

    async function setupTurnstile() {
      try {
        await ensureTurnstileScript()

        if (cancelled || turnstileWidgetIdRef.current || !window.turnstile || !turnstileContainerRef.current) {
          return
        }

        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey!,
          execution: 'execute',
          callback: (token) => {
            turnstileTokenResolverRef.current?.(token)
            turnstileTokenResolverRef.current = null
            turnstileTokenRejectRef.current = null
          },
          'error-callback': (code) => {
            turnstileTokenRejectRef.current?.(new Error(code || 'Turnstile failed.'))
            turnstileTokenResolverRef.current = null
            turnstileTokenRejectRef.current = null
          },
          'expired-callback': () => {
            turnstileTokenRejectRef.current?.(new Error('Turnstile expired.'))
            turnstileTokenResolverRef.current = null
            turnstileTokenRejectRef.current = null
          },
        })
      } catch (error) {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : 'Unable to initialize Turnstile.')
        }
      }
    }

    void setupTurnstile()

    return () => {
      cancelled = true
    }
  }, [publicConfig])

  function mergeFiles(files: FileList | File[]) {
    const nextEntries = Array.from(files)
      .filter((file) => file.size > 0)
      .map((file) => {
        const relativePath = getRelativePath(file)
        return {
          file,
          relativePath,
          key: createFileKey(file, relativePath),
        } satisfies SelectedFile
      })

    setSelectedFiles((current) => {
      const map = new Map(current.map((entry) => [entry.key, entry]))
      for (const entry of nextEntries) {
        map.set(entry.key, entry)
      }
      return Array.from(map.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    })

    setStatusMessage(null)
    setCarePackageId(null)
    setUploadState('idle')
  }

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      mergeFiles(event.target.files)
      event.target.value = ''
    }
  }

  async function getTurnstileToken() {
    if (!publicConfig?.turnstileRequired) {
      return null
    }

    const widgetId = turnstileWidgetIdRef.current
    const api = window.turnstile
    if (!widgetId || !api) {
      throw new Error('Turnstile is not ready yet.')
    }

    return new Promise<string>((resolve, reject) => {
      turnstileTokenResolverRef.current = resolve
      turnstileTokenRejectRef.current = reject
      api.reset(widgetId)
      api.execute(widgetId)
    })
  }

  async function uploadMultipartFile(carePackageIdValue: string, sessionFile: SessionFile, file: File) {
    const startResponse = await fetch(
      `/api/inbox/sessions/${carePackageIdValue}/files/${sessionFile.id}/start`,
      {
        method: 'POST',
      },
    )

    if (!startResponse.ok) {
      throw new Error(await parseErrorMessage(startResponse))
    }

    const startPayload = (await startResponse.json()) as {
      partSizeBytes: number
      uploadedParts: Array<{ partNumber: number }>
    }

    const uploadedParts = new Set(startPayload.uploadedParts.map((part) => part.partNumber))
    const partSize = startPayload.partSizeBytes
    const totalParts = Math.ceil(file.size / partSize)

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const chunkStart = (partNumber - 1) * partSize
      const chunkEnd = Math.min(chunkStart + partSize, file.size)
      const chunkSize = chunkEnd - chunkStart

      if (uploadedParts.has(partNumber)) {
        setProgressBytes((current) => current + chunkSize)
        continue
      }

      const body = file.slice(chunkStart, chunkEnd)
      const response = await fetch(
        `/api/inbox/sessions/${carePackageIdValue}/files/${sessionFile.id}/parts/${partNumber}`,
        {
          method: 'PUT',
          headers: {
            'content-type': file.type || 'application/octet-stream',
          },
          body,
        },
      )

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response))
      }

      setProgressBytes((current) => current + chunkSize)
    }

    const completeResponse = await fetch(
      `/api/inbox/sessions/${carePackageIdValue}/files/${sessionFile.id}/complete`,
      {
        method: 'POST',
      },
    )

    if (!completeResponse.ok) {
      throw new Error(await parseErrorMessage(completeResponse))
    }
  }

  async function uploadDirectFile(carePackageIdValue: string, sessionFile: SessionFile, file: File) {
    const response = await fetch(
      `/api/inbox/sessions/${carePackageIdValue}/files/${sessionFile.id}/start`,
      {
        method: 'POST',
      },
    )

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response))
    }

    const uploadResponse = await fetch(`/api/inbox/sessions/${carePackageIdValue}/files/${sessionFile.id}`, {
      method: 'PUT',
      headers: {
        'content-type': file.type || 'application/octet-stream',
      },
      body: file,
    })

    if (!uploadResponse.ok) {
      throw new Error(await parseErrorMessage(uploadResponse))
    }

    setProgressBytes((current) => current + file.size)
  }

  async function onSubmit() {
    if (isUploading) {
      return
    }

    if (!publicConfig) {
      setUploadState('error')
      setStatusMessage(configError || 'Config is still loading.')
      return
    }

    if (selectedFiles.length === 0) {
      setUploadState('error')
      setStatusMessage('Choose at least one file.')
      return
    }

    if (mode === 'invite' && !invitedUnlocked) {
      setUploadState('error')
      setStatusMessage('Enter a valid access code.')
      return
    }

    const token = await getTurnstileToken().catch((error: Error) => {
      setUploadState('error')
      setStatusMessage(error.message)
      return null
    })

    if (publicConfig.turnstileRequired && !token) {
      return
    }

    setUploadState('uploading')
    setStatusMessage('Uploading...')
    setProgressBytes(0)
    setTotalBytes(totalSelectedBytes)
    setCarePackageId(null)

    const manifest = selectedFiles.map((entry) => ({
      relativePath: entry.relativePath,
      sizeBytes: entry.file.size,
      contentType: entry.file.type || null,
      lastModified: entry.file.lastModified || null,
    }))

    const comment = buildComment({
      mode,
      note,
      socialHandle,
      externalLink,
      visibility,
    })

    try {
      const sessionResponse = await fetch('/api/inbox/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          turnstileToken: token,
          uploadCode: invitedUnlocked ? accessCode.trim() : undefined,
          senderName: invitedUnlocked ? senderName.trim() || undefined : undefined,
          comment: comment ?? undefined,
          files: manifest,
        }),
      })

      if (!sessionResponse.ok) {
        throw new Error(await parseErrorMessage(sessionResponse))
      }

      const session = (await sessionResponse.json()) as SessionResponse
      setCarePackageId(session.carePackage.id)

      const fileMap = new Map(selectedFiles.map((entry) => [entry.relativePath, entry.file]))

      for (const sessionFile of session.files) {
        const file = fileMap.get(sessionFile.relativePath)
        if (!file) {
          throw new Error(`Missing local file for ${sessionFile.relativePath}.`)
        }

        if (sessionFile.uploadStrategy === 'multipart') {
          await uploadMultipartFile(session.carePackage.id, sessionFile, file)
          continue
        }

        await uploadDirectFile(session.carePackage.id, sessionFile, file)
      }

      const completeResponse = await fetch(`/api/inbox/sessions/${session.carePackage.id}/complete`, {
        method: 'POST',
      })

      if (!completeResponse.ok) {
        throw new Error(await parseErrorMessage(completeResponse))
      }

      const completed = (await completeResponse.json()) as CompleteSessionResponse
      setUploadState('success')
      setStatusMessage(`Sent. ${completed.carePackage.id}`)
      setCarePackageId(completed.carePackage.id)
    } catch (error) {
      setUploadState('error')
      setStatusMessage(error instanceof Error ? error.message : 'Upload failed.')
    }
  }

  return (
    <main className="app-shell">
      <section className="app-column">
        <header className="page-header">
          <p className="page-eyebrow">Slack Classics</p>
          <h1>Inbox</h1>
        </header>

        <section className="upload-panel">
          <div className="section-head">
            <h2>Upload</h2>
          </div>

          <div className="dropzone">
            <p className="dropzone-title">Drop files or choose a folder</p>
            <div className="dropzone-actions">
              <button disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button">
                Files
              </button>
              <button
                className="ghost-button"
                disabled={isUploading}
                onClick={() => folderInputRef.current?.click()}
                type="button"
              >
                Folder
              </button>
              <button
                className="ghost-button"
                disabled={isUploading || selectedFiles.length === 0}
                onClick={() => setSelectedFiles([])}
                type="button"
              >
                Clear
              </button>
            </div>
            <input hidden multiple onChange={onFilesSelected} ref={fileInputRef} type="file" />
            <input
              hidden
              multiple
              onChange={onFilesSelected}
              ref={(node) => {
                folderInputRef.current = node
                if (node) {
                  ;(node as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true
                }
              }}
              type="file"
            />
          </div>

          {selectedFiles.length > 0 ? (
            <section className="file-list-panel">
              <div className="file-list-head">
                <strong>{selectedFiles.length} files</strong>
                <span>{formatBytes(totalSelectedBytes)}</span>
              </div>
              <ul className="file-list">
                {selectedFiles.map((entry) => (
                  <li key={entry.key}>
                    <span>{entry.relativePath}</span>
                    <span>{formatBytes(entry.file.size)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mode-toggle">
            <button
              className={`mode-option ${mode === 'anon' ? 'is-active' : ''}`}
              disabled={isUploading}
              onClick={() => setMode('anon')}
              type="button"
            >
              <strong>Anon</strong>
            </button>
            <button
              className={`mode-option ${mode === 'invite' ? 'is-active' : ''}`}
              disabled={isUploading}
              onClick={() => setMode('invite')}
              type="button"
            >
              <strong>Invite</strong>
            </button>
          </section>

          {mode === 'invite' ? (
            <section className="invite-panel">
              <div className="field-stack">
                <label>
                  <span>Access code</span>
                  <input
                    disabled={isUploading}
                    onChange={(event) => setAccessCode(event.target.value)}
                    placeholder="Enter access code"
                    value={accessCode}
                  />
                </label>
              </div>

              {invitedUnlocked ? (
                <section className="unlocked-panel">
                  <div className="field-stack">
                    <label>
                      <span>Alias or name</span>
                      <input
                        disabled={isUploading}
                        onChange={(event) => setSenderName(event.target.value)}
                        value={senderName}
                      />
                    </label>
                    <label>
                      <span>Social handle</span>
                      <input
                        disabled={isUploading}
                        onChange={(event) => setSocialHandle(event.target.value)}
                        value={socialHandle}
                      />
                    </label>
                    <label>
                      <span>External link</span>
                      <input
                        disabled={isUploading}
                        onChange={(event) => setExternalLink(event.target.value)}
                        value={externalLink}
                      />
                    </label>
                    <label>
                      <span>Note</span>
                      <textarea
                        disabled={isUploading}
                        onChange={(event) => setNote(event.target.value)}
                        value={note}
                      />
                    </label>
                  </div>

                  <div className="visibility-stack">
                    {(['private', 'community', 'peep'] as Visibility[]).map((option) => (
                      <button
                        className={`visibility-card ${visibility === option ? 'is-selected' : ''}`}
                        disabled={isUploading}
                        key={option}
                        onClick={() => setVisibility(option)}
                        type="button"
                      >
                        <strong>{option.charAt(0).toUpperCase() + option.slice(1)}</strong>
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="locked-panel" />
              )}
            </section>
          ) : null}

          {statusMessage || configError || totalBytes > 0 ? (
            <section className={`status-panel is-${uploadState}`}>
              {statusMessage ? <strong>{statusMessage}</strong> : null}
              {totalBytes > 0 ? (
                <>
                  <div className="progress-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min((progressBytes / totalBytes) * 100, 100)}%` }} />
                  </div>
                  <div className="progress-meta">
                    <span>{formatBytes(progressBytes)}</span>
                    <span>{formatBytes(totalBytes)}</span>
                  </div>
                </>
              ) : null}
              {carePackageId ? <code>{carePackageId}</code> : null}
              {!statusMessage && configError ? <strong>{configError}</strong> : null}
            </section>
          ) : null}

          <div className="submit-row">
            <button className="submit-button" disabled={isUploading || !!configError} onClick={onSubmit} type="button">
              {isUploading
                ? 'Uploading...'
                : mode === 'anon'
                  ? 'Post it ✌️'
                  : 'Send invited care package'}
            </button>
          </div>
        </section>
      </section>
      <div aria-hidden="true" className="turnstile-slot" ref={turnstileContainerRef} />
    </main>
  )
}

function App() {
  const path = window.location.pathname
  if (path.startsWith('/admin')) {
    return <AdminApp />
  }

  return <InboxApp />
}

export default App
