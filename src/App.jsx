import { useMemo, useState } from 'react'
import {
  buildWorkoutFit,
  defaultWorkoutJson,
  parseWorkoutDraft,
  summarizeWorkout,
} from './fitBuilder'
import './App.css'

function App() {
  const [draft, setDraft] = useState(defaultWorkoutJson)
  const [downloadState, setDownloadState] = useState('idle')

  const analysis = useMemo(() => parseWorkoutDraft(draft), [draft])
  const summary = useMemo(() => {
    if (!analysis.workout) {
      return null
    }

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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Local-only FIT workout builder</p>
          <h1>Build pool swim workouts, export .fit, copy to Garmin over USB.</h1>
          <p className="lede">
            Paste strict JSON, validate it locally, and generate a Garmin workout file without a backend or Garmin Express.
            On Linux, the direct USB path is the safest first move.
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

export default App
