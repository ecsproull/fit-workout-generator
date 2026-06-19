import React, { useMemo, useState } from 'react'
import {
  buildWorkoutFit,
  defaultWorkoutJson,
  parseWorkoutDraft,
  summarizeWorkout,
  autoFixWarnings,
} from './fitBuilder'
import './App.css'

function App() {
  const [draft, setDraft] = useState(defaultWorkoutJson)
  const [downloadState, setDownloadState] = useState('idle')
  // Simple IndexedDB key and helper to open the DB for persisting directory handles
  const idbKey = 'fitbuilder-handles'

  const analysis = useMemo(() => parseWorkoutDraft(draft), [draft])
  const summary = useMemo(() => {
    if (!analysis.workout) return null
    return summarizeWorkout(analysis.workout)
  }, [analysis.workout])

  const handleDownload = () => {
    if (!analysis.workout || analysis.errors.length > 0) {
      return
    }

    setDownloadState('building')

    try {
      const bytes = buildWorkoutFit(analysis.workout)
      const blob = new Blob([bytes], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${analysis.workout.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workout'}.fit`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setDownloadState('ready')
    } catch (error) {
      setDownloadState(error instanceof Error ? error.message : 'Failed to build FIT file')
    }
  }

  const handleCorrectWarnings = () => {
    try {
      const fixed = autoFixWarnings(draft)
      setDraft(fixed)
    } catch (error) {
      console.error('Auto-fix failed', error)
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open('fitbuilder-files', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('handles')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async function getStoredDirHandle() {
    if (!('indexedDB' in window)) return null
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly')
      const store = tx.objectStore('handles')
      const getReq = store.get(idbKey)
      getReq.onsuccess = () => resolve(getReq.result || null)
      getReq.onerror = () => resolve(null)
    })
  }

  async function storeDirHandle(handle) {
    if (!('indexedDB' in window)) return
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite')
      const store = tx.objectStore('handles')
      const putReq = store.put(handle, idbKey)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    })
  }

  async function handleSaveJson() {
    // Prefer File System Access API when available
    try {
      setDownloadState('saving')

      if ('showDirectoryPicker' in window) {
        let dirHandle = await getStoredDirHandle()

        if (dirHandle) {
          // ensure we still have write permission for the stored directory handle
          if (typeof dirHandle.queryPermission === 'function') {
            const perm = await dirHandle.queryPermission({ mode: 'readwrite' })
            if (perm !== 'granted') {
              const req = await dirHandle.requestPermission({ mode: 'readwrite' })
              if (req !== 'granted') {
                // fall back to asking the user to pick a directory again
                dirHandle = await window.showDirectoryPicker()
                try {
                  await storeDirHandle(dirHandle)
                } catch (e) {
                  console.warn('Could not persist directory handle', e)
                }
              }
            }
          }
        } else {
          dirHandle = await window.showDirectoryPicker()
          try {
            await storeDirHandle(dirHandle)
          } catch (e) {
            console.warn('Could not persist directory handle', e)
          }
        }

        // Prompt for filename so we don't overwrite the same name every time
        const filename = window.prompt('Filename to save as', 'workout.json') || 'workout.json'
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(draft)
        await writable.close()
        setDownloadState('saved')
        return
      }

      // If directory picker isn't available, prefer the save file picker when present
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'workout.json',
          types: [
            {
              description: 'JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(draft)
        await writable.close()
        setDownloadState('saved')
        return
      }

      // Fallback: trigger browser download
      const blob = new Blob([draft], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'workout.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setDownloadState('saved')
    } catch (error) {
      console.error('Save failed', error)
      setDownloadState(error instanceof Error ? error.message : 'Save failed')
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Local-only FIT workout builder</p>
          <h1>Swim Workout Builder</h1>
          <p className="lede">
            Paste strict JSON, validate it locally, and generate a Garmin workout file. Suggestion: Use ChatGPT to convert natural language
            instructions to JSON. You can pick any only swim workout and paste the text from the workout instructions into you favorite AI client
            and request conversion for use with the Garmin FIT library.
          </p>
          <div className="hero-notes">
            <span>React + JavaScript</span>
            <span>Official Garmin FIT JS SDK</span>
            <span>Strict JSON validation</span>
          </div>
        </div>

        <aside className="hero-card">
          <h2>USB workflow</h2>
          <ol>
            <li>Export the .fit file from this app.</li>
            <li>Connect the watch by USB and open the Garmin drive.</li>
            <li>Copy the file into the device import folder, usually /Garmin/NewFiles.</li>
            <li>Eject the device and let Garmin import it on the next sync.</li>
          </ol>
          <p>
            Garmin Express is optional here. If it is awkward on Linux, you can skip it and use the USB file drop path.
          </p>
        </aside>
      </section>

      <section className="workspace-grid">
        <div className="panel editor-panel">
          <div className="panel-header">
            <div>
              <h2>Workout JSON</h2>
              <p>Strict draft format with repeats, swim steps, and rest blocks.</p>
            </div>
            <button type="button" className="ghost-button" onClick={() => setDraft(defaultWorkoutJson)}>
              Load sample
            </button>
          </div>

          <textarea
            value={draft}
            spellCheck="false"
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Workout JSON editor"
          />

          <div className="actions">
            <button type="button" className="primary-button" onClick={handleDownload} disabled={analysis.errors.length > 0}>
              Download FIT
            </button>
            <button type="button" className="ghost-button" onClick={handleCorrectWarnings} disabled={analysis.warnings.length === 0}>
              Correct Warnings
            </button>
            <button type="button" className="ghost-button" onClick={handleSaveJson}>
              Save JSON
            </button>
            <span className="status-text">{downloadState === 'idle' ? 'Ready to export.' : downloadState}</span>
          </div>
        </div>

        <div className="panel detail-panel">
          <h2>Preview</h2>
          {summary ? (
            <>
              <div className="preview-grid">
                <div>
                  <span className="label">Name</span>
                  <strong>{summary.name}</strong>
                </div>
                <div>
                  <span className="label">Pool</span>
                  <strong>
                    {summary.poolLength} {summary.poolLengthUnit}
                  </strong>
                </div>
                <div>
                  <span className="label">Steps</span>
                  <strong>{summary.stepCount}</strong>
                </div>
                <div>
                  <span className="label">Estimated distance (repeats expanded)</span>
                  <strong>
                    {summary.estimatedDistance} {summary.distanceUnit}
                  </strong>
                </div>
                <div>
                  <span className="label">Template distance (single pass)</span>
                  <strong>
                    {summary.templateDistance} {summary.distanceUnit}
                  </strong>
                </div>
              </div>

              {summary.estimatedDistance !== summary.templateDistance && (
                <p className="status-text">
                  Repeat expansion adds {summary.estimatedDistance - summary.templateDistance} {summary.distanceUnit}.
                </p>
              )}
            </>
          ) : (
            <p className="success-copy">Fix the JSON to see a preview.</p>
          )}

          <h2>Validation</h2>
          {analysis.errors.length > 0 ? (
            <ul className="issue-list">
              {analysis.errors.map((issue) => (
                <li key={`${issue.path.join('.')}-${issue.message}`} className="issue issue-error">
                  <strong>{issue.path.length > 0 ? issue.path.join('.') : 'draft'}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="success-copy">JSON is valid and ready to encode.</p>
          )}

          {analysis.warnings.length > 0 && (
            <>
              <h3>Warnings</h3>
              <ul className="issue-list">
                {analysis.warnings.map((issue) => (
                  <li key={`${issue.path.join('.')}-${issue.message}`} className="issue issue-warning">
                    <strong>{issue.path.length > 0 ? issue.path.join('.') : 'draft'}</strong>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section style={{ padding: 32 }}>
            <h2>Something went wrong</h2>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
            <p>Open DevTools console for details.</p>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
