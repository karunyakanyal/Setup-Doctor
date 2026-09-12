import { useEffect, useState } from 'react'
import './App.css'
import AnalyzeRepositoryModal from './components/AnalyzeRepositoryModal'
import Header from './components/Header'
import RecentAnalyses from './components/RecentAnalyses'
import Sidebar from './components/Sidebar'
import StatCard from './components/StatCard'

const HISTORY_STORAGE_KEY = 'setupdoctor-history'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [repository, setRepository] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [diagnosticsSummary, setDiagnosticsSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [stack, setStack] = useState([])
  const [analysisHistory, setAnalysisHistory] = useState(() => {
    try {
      const storedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY)
      const parsedHistory = storedHistory ? JSON.parse(storedHistory) : []
      return Array.isArray(parsedHistory) ? parsedHistory : []
    } catch {
      return []
    }
  })
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState(false)

  useEffect(() => {
    if (!showSuccessToast) return undefined

    const timeoutId = window.setTimeout(() => setShowSuccessToast(false), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [showSuccessToast])

  async function runDiagnostics(repositoryData) {
    setDiagnostics([])
    setDiagnosticsSummary(null)
    setHealth(null)
    setStack([])
    setDiagnosticsError(false)
    setIsDiagnosticsLoading(true)

    try {
      const response = await fetch('http://localhost:5000/api/repository/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repositoryData.owner,
          repo: repositoryData.name,
          branch: repositoryData.defaultBranch,
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error('Diagnostic request failed')
      }

      setDiagnostics(Array.isArray(data.diagnostics) ? data.diagnostics : [])
      setDiagnosticsSummary(data.summary || null)
      const responseHealth = data.health
      setHealth(
        responseHealth
        && typeof responseHealth.score === 'number'
        && typeof responseHealth.status === 'string'
          ? responseHealth
          : null,
      )
      setStack(Array.isArray(data.stack) ? data.stack : [])

      if (responseHealth && typeof responseHealth.score === 'number' && typeof responseHealth.status === 'string') {
        const historyEntry = {
          repository: repositoryData,
          health: responseHealth,
          summary: data.summary || null,
          diagnostics: data.diagnostics || [],
          analyzedAt: new Date().toISOString(),
        }
        setAnalysisHistory((currentHistory) => {
          const nextHistory = [historyEntry, ...currentHistory].slice(0, 5)
          try {
            window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
          } catch {
            return nextHistory
          }
          return nextHistory
        })
      }
    } catch {
      setDiagnosticsError(true)
    } finally {
      setIsDiagnosticsLoading(false)
    }
  }

  function handleAnalysisSuccess(repositoryData) {
    setRepository(repositoryData)
    setIsModalOpen(false)
    setShowSuccessToast(true)
    void runDiagnostics(repositoryData)
  }

  function handleSelectAnalysis(analysis) {
    setSelectedAnalysis(analysis)
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="page-shell">
        <Header />
        <main className="dashboard-main">
          <section className="welcome-section">
            <div>
              <p className="eyebrow">Monday, September 16, 2024</p>
              <h1>Good morning, Alex <span className="wave">&#128075;</span></h1>
              <p className="welcome-copy">Get a clear picture of your project setup and resolve issues before they slow you down.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setIsModalOpen(true)}><span>+</span> Analyze Repository</button>
          </section>

          <section className="stats-grid" aria-label="Dashboard statistics">
            <StatCard label="Projects Analyzed" value="48" detail="+12.5%" icon="projects" tone="blue" />
            <StatCard label="Issues Found" value="127" detail="+8.2%" icon="issues" tone="orange" />
            <StatCard label="Successful Setups" value="39" detail="+18.4%" icon="success" tone="green" />
          </section>

          {repository && (
            <section className="repository-summary" aria-labelledby="repository-summary-title">
              <div className="repository-summary-heading">
                <div>
                  <p className="eyebrow">Latest repository</p>
                  <h2 id="repository-summary-title">{repository.fullName}</h2>
                </div>
                <span className="repository-ready">Ready for analysis</span>
              </div>
              <div className="repository-details">
                <div><span>Owner</span><strong>{repository.owner}</strong></div>
                <div><span>Default branch</span><strong>{repository.defaultBranch}</strong></div>
                <div><span>Language</span><strong>{repository.language || 'Not specified'}</strong></div>
                <div><span>Stars</span><strong>{typeof repository.stars === 'number' ? repository.stars.toLocaleString() : 'Not available'}</strong></div>
              </div>
              <p className="repository-description">{repository.description || 'No description provided.'}</p>
            </section>
          )}

          {repository && (
            <section className="repository-health" aria-labelledby="repository-health-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Setup checks</p>
                  <h2 id="repository-health-title">Repository Health</h2>
                </div>
              </div>
              {isDiagnosticsLoading && <p className="diagnostics-message">Running diagnostics...</p>}
              {diagnosticsError && <p className="diagnostics-message diagnostics-error">Unable to run diagnostics.</p>}
              {!isDiagnosticsLoading && !diagnosticsError && (
                <div>
                  {health && typeof health.score === 'number' && typeof health.status === 'string' && (
                    <div className="diagnostics-health">
                      <strong>{health.score} / 100</strong>
                      <span className={`health-status health-${health.status.toLowerCase().replace(/\s+/g, '-')}`}>{health.status}</span>
                    </div>
                  )}
                  {diagnosticsSummary && (
                    <div className="diagnostics-summary" aria-label="Diagnostic summary">
                      <span>{diagnosticsSummary.total} Checks</span>
                      <span>{diagnosticsSummary.pass} Passed</span>
                      <span>{diagnosticsSummary.warning} Warnings</span>
                      <span>{diagnosticsSummary.error} Errors</span>
                    </div>
                  )}
                  <div className="diagnostics-list">
                    {diagnostics.map((diagnostic) => (
                      <div className="diagnostic-row" key={diagnostic.rule}>
                        <span className={`diagnostic-status ${diagnostic.status}`}>
                          <span />
                          {diagnostic.status}
                        </span>
                        <div className="diagnostic-copy">
                          <span className="diagnostic-message">{diagnostic.message}</span>
                          {(diagnostic.status === 'warning' || diagnostic.status === 'error') && (
                            <div className="diagnostic-details">
                              {typeof diagnostic.why === 'string' && diagnostic.why.trim() && (
                                <p><strong>Why?</strong> {diagnostic.why}</p>
                              )}
                              {typeof diagnostic.recommendation === 'string' && diagnostic.recommendation.trim() && (
                                <p><strong>Recommendation</strong> {diagnostic.recommendation}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {repository && (
            <section className="technology-stack" aria-labelledby="technology-stack-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Detected tools</p>
                  <h2 id="technology-stack-title">Technology Stack</h2>
                </div>
              </div>
              {isDiagnosticsLoading && <p className="diagnostics-message">Detecting technologies...</p>}
              {diagnosticsError && <p className="diagnostics-message diagnostics-error">Unable to detect technologies.</p>}
              {!isDiagnosticsLoading && !diagnosticsError && (
                stack.some((technology) => technology.detected) ? (
                  <div className="technology-list">
                    {stack.filter((technology) => technology.detected).map((technology) => (
                      <span className="technology-item" key={technology.name}>{technology.name}</span>
                    ))}
                  </div>
                ) : (
                  <p className="diagnostics-message">No known technologies detected.</p>
                )
              )}
            </section>
          )}

          {selectedAnalysis && (
            <section className="selected-analysis" aria-labelledby="selected-analysis-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">History</p>
                  <h2 id="selected-analysis-title">Selected Analysis</h2>
                </div>
              </div>
              <div className="repository-details">
                <div><span>Repository</span><strong>{selectedAnalysis.repository?.fullName || selectedAnalysis.repository?.name || 'Unknown repository'}</strong></div>
                <div><span>Default branch</span><strong>{selectedAnalysis.repository?.defaultBranch || 'Unknown branch'}</strong></div>
                <div><span>Health score</span><strong>{selectedAnalysis.health?.score ?? 'Unknown'}</strong></div>
                <div><span>Health status</span><strong>{selectedAnalysis.health?.status || 'Unknown'}</strong></div>
                <div><span>Total checks</span><strong>{selectedAnalysis.summary?.total ?? 'Unknown'}</strong></div>
                <div><span>Passed checks</span><strong>{selectedAnalysis.summary?.pass ?? 'Unknown'}</strong></div>
                <div><span>Warnings</span><strong>{selectedAnalysis.summary?.warning ?? 'Unknown'}</strong></div>
                <div><span>Errors</span><strong>{selectedAnalysis.summary?.error ?? 'Unknown'}</strong></div>
                <div><span>Analyzed</span><strong>{selectedAnalysis.analyzedAt ? new Date(selectedAnalysis.analyzedAt).toLocaleString() : 'Unknown time'}</strong></div>
              </div>
              <h3>Diagnostic Checks</h3>
              <div className="diagnostic-list">
                {(Array.isArray(selectedAnalysis.diagnostics) ? selectedAnalysis.diagnostics : []).map((diagnostic) => (
                  <div className="diagnostic-row" key={diagnostic.rule}>
                    <span className={`diagnostic-status ${diagnostic.status}`}>
                      <span />
                      {diagnostic.status}
                    </span>
                    <div className="diagnostic-copy">
                      <span className="diagnostic-message">{diagnostic.message}</span>
                      {(diagnostic.status === 'warning' || diagnostic.status === 'error') && (
                        <div className="diagnostic-details">
                          {typeof diagnostic.why === 'string' && diagnostic.why.trim() && (
                            <p><strong>Why?</strong> {diagnostic.why}</p>
                          )}
                          {typeof diagnostic.recommendation === 'string' && diagnostic.recommendation.trim() && (
                            <p><strong>Recommendation</strong> {diagnostic.recommendation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <RecentAnalyses history={analysisHistory} onSelectAnalysis={handleSelectAnalysis} />
        </main>
      </div>
      {isModalOpen && <AnalyzeRepositoryModal onClose={() => setIsModalOpen(false)} onSuccess={handleAnalysisSuccess} />}
      {showSuccessToast && <div className="success-toast" role="status">&#10003; Repository added for analysis</div>}
    </div>
  )
}

export default App
