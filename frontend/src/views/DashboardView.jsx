import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AnalyzeRepositoryModal from '../components/AnalyzeRepositoryModal'
import RecentAnalyses from '../components/RecentAnalyses'
import StatCard from '../components/StatCard'
import { useHistory } from '../hooks/useHistory'
import { useProjects } from '../hooks/useProjects'

function DashboardView({ user = { name: 'Developer', initials: 'D' } }) {
  const navigate = useNavigate()
  const { projects, recordProjectAnalysis } = useProjects()
  const {
    analysisHistory,
    addAnalysisEntry,
    selectAnalysis,
    issuesFound,
    successfulSetups,
  } = useHistory()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [repository, setRepository] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [diagnosticsSummary, setDiagnosticsSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [stack, setStack] = useState([])
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState(false)

  useEffect(() => {
    if (!showSuccessToast) {
      return undefined
    }

    const timeoutId = window.setTimeout(
      () => setShowSuccessToast(false),
      3500,
    )

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
      const response = await fetch('/api/repository/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      if (
        responseHealth &&
        typeof responseHealth.score === 'number' &&
        typeof responseHealth.status === 'string'
      ) {
        setHealth(responseHealth)
        addAnalysisEntry(repositoryData, responseHealth, data.summary, data.diagnostics)
        recordProjectAnalysis(repositoryData, responseHealth)
      } else {
        setHealth(null)
      }

      setStack(Array.isArray(data.stack) ? data.stack : [])
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
    selectAnalysis(analysis)
    navigate('/history')
  }

  function handleSaveDiagnosticToVault(diagnostic) {
    navigate('/bug-vault', {
      state: { fromDiagnostic: diagnostic, repositoryName: repository?.fullName || null },
    })
  }

  return (
    <>
      <section className="welcome-section">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>

          <h1>
            Good morning, {user.name.split(' ')[0]}{' '}
            <span className="wave">&#128075;</span>
          </h1>

          <p className="welcome-copy">
            Get a clear picture of your project setup and resolve issues before they slow you down.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => setIsModalOpen(true)}
        >
          <span>+</span>
          Analyze Repository
        </button>
      </section>

      <section className="stats-grid" aria-label="Dashboard statistics">
        <StatCard
          label="Projects Analyzed"
          value={projects.length}
          icon="projects"
          tone="blue"
        />

        <StatCard
          label="Issues Found"
          value={issuesFound}
          icon="issues"
          tone="orange"
        />

        <StatCard
          label="Successful Setups"
          value={successfulSetups}
          icon="success"
          tone="green"
        />
      </section>

      {isDiagnosticsLoading && (
        <section className="repository-summary" aria-live="polite">
          <p className="diagnostics-message">
            Running diagnostics... Checking configuration and dependencies.
          </p>
        </section>
      )}

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
            <div>
              <span>Owner</span>
              <strong>{repository.owner}</strong>
            </div>

            <div>
              <span>Default branch</span>
              <strong>{repository.defaultBranch}</strong>
            </div>

            <div>
              <span>Language</span>
              <strong>{repository.language || 'Not specified'}</strong>
            </div>

            <div>
              <span>Stars</span>
              <strong>
                {typeof repository.stars === 'number'
                  ? repository.stars.toLocaleString()
                  : 'Not available'}
              </strong>
            </div>
          </div>

          <p className="repository-description">
            {repository.description || 'No description provided.'}
          </p>
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

          {diagnosticsError && (
            <p className="diagnostics-message diagnostics-error">
              Unable to run diagnostics.
            </p>
          )}

          {!isDiagnosticsLoading && !diagnosticsError && (
            <div>
              {health && (
                <div className="diagnostics-health">
                  <strong>{health.score} / 100</strong>
                  <span
                    className={`health-status health-${health.status
                      .toLowerCase()
                      .replace(/\s+/g, '-')}`}
                  >
                    {health.status}
                  </span>
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
                            <p>
                              <strong>Why?</strong> {diagnostic.why}
                            </p>
                          )}

                          {typeof diagnostic.recommendation === 'string' && diagnostic.recommendation.trim() && (
                            <p>
                              <strong>Recommendation</strong> {diagnostic.recommendation}
                            </p>
                          )}

                          <button
                            type="button"
                            className="diagnostic-save-button"
                            onClick={() => handleSaveDiagnosticToVault(diagnostic)}
                          >
                            Save to Bug Vault
                          </button>
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

          {!isDiagnosticsLoading && !diagnosticsError && (
            stack.some((tech) => tech.detected) ? (
              <div className="technology-list">
                {stack
                  .filter((tech) => tech.detected)
                  .map((tech) => (
                    <span className="technology-item" key={tech.name}>
                      {tech.name}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="diagnostics-message">No known technologies detected.</p>
            )
          )}
        </section>
      )}

      {!repository && !isDiagnosticsLoading && (
        <section className="repository-summary bug-vault-empty" aria-label="No repository analyzed">
          <h2>No repository analyzed yet</h2>
          <p className="welcome-copy">
            Click &quot;Analyze Repository&quot; above to inspect any public GitHub repository.
          </p>
        </section>
      )}

      <RecentAnalyses
        history={analysisHistory}
        onSelectAnalysis={handleSelectAnalysis}
      />

      {isModalOpen && (
        <AnalyzeRepositoryModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleAnalysisSuccess}
        />
      )}

      {showSuccessToast && (
        <div className="success-toast" role="status">
          &#10003; Repository added for analysis
        </div>
      )}
    </>
  )
}

export default DashboardView
