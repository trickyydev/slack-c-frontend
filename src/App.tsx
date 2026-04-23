import { useState } from 'react'
import './App.css'

function App() {
  const [mode, setMode] = useState<'anon' | 'invite'>('anon')
  const [accessCode, setAccessCode] = useState('')
  const normalizedCode = accessCode.trim().toLowerCase()
  const invitedUnlocked = mode === 'invite' && normalizedCode === 'deano'

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
              <button type="button">Choose files</button>
              <button className="ghost-button" type="button">
                Choose folder
              </button>
            </div>
          </div>

          <section className="mode-toggle">
            <button
              className={`mode-option ${mode === 'anon' ? 'is-active' : ''}`}
              onClick={() => setMode('anon')}
              type="button"
            >
              <strong>Anon</strong>
            </button>
            <button
              className={`mode-option ${mode === 'invite' ? 'is-active' : ''}`}
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
                      <input defaultValue="Deano" />
                    </label>
                    <label>
                      <span>Social handle</span>
                      <input defaultValue="@deano" />
                    </label>
                    <label>
                      <span>External link</span>
                      <input defaultValue="https://example.com/deano" />
                    </label>
                    <label>
                      <span>Note</span>
                      <textarea defaultValue="Three sketches, one loop, one rough mix." />
                    </label>
                  </div>

                  <div className="visibility-stack">
                    <button className="visibility-card" type="button">
                      <strong>Private</strong>
                    </button>
                    <button className="visibility-card is-selected" type="button">
                      <strong>Community</strong>
                    </button>
                    <button className="visibility-card" type="button">
                      <strong>Peep</strong>
                    </button>
                  </div>
                </section>
              ) : (
                <section className="locked-panel" />
              )}
            </section>
          ) : null}

          <div className="submit-row">
            <button className="submit-button" type="button">
              {mode === 'anon' ? 'Send anonymous care package' : 'Send invited care package'}
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
