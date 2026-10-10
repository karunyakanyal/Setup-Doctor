import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AnalyzeRepositoryModal from '../components/AnalyzeRepositoryModal'
import RecentAnalyses from '../components/RecentAnalyses'
import StatCard from '../components/StatCard'
import { useBugVault } from '../hooks/useBugVault'
import { useHistory } from '../hooks/useHistory'
import { useProjects } from '../hooks/useProjects'
import DiagnosticsHealthSummary from '../components/diagnostics/DiagnosticsHealthSummary'
import ScoreBreakdown from '../components/diagnostics/ScoreBreakdown'
import DiagnosticCard from '../components/diagnostics/DiagnosticCard'
import DiagnosticsFilterTabs from '../components/diagnostics/DiagnosticsFilterTabs'
import DiagnosticsEmptyState from '../components/diagnostics/DiagnosticsEmptyState'
import DiagnosticsLoadingSkeleton from '../components/diagnostics/DiagnosticsLoadingSkeleton'
import DiagnosticsErrorState from '../components/diagnostics/DiagnosticsErrorState'
import {
  filterDiagnostics,
  groupDiagnosticsByCategory,
  getFilterCounts,
  getGrade,
  normalizeStatus,
  resolveLatestAnalysis,
  extractAnalysisState,
  normalizeTechnologyStack,
} from '../utils/diagnosisFormatters'
import { getBugRepositoryName } from '../utils/bugVaultData'

function DashboardView({ user = { name: 'Developer', initials: 'D' } }) {
  const navigate = useNavigate()
  const { projects, recordProjectAnalysis } = useProjects()
  const { bugs } = useBugVault()
  const {
    analysisHistory,
    addAnalysisEntry,
    selectedAnalysis,
    selectAnalysis,
    issuesFound,
    successfulSetups,
  } = useHistory()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [repository, setRepository] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).repository
  })
  const [diagnostics, setDiagnostics] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).diagnostics
  })
  const [health, setHealth] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).health
  })
  const [framework, setFramework] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).framework
  })
  const [monorepo, setMonorepo] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).monorepo
  })
  const [stack, setStack] = useState(() => {
    const active = resolveLatestAnalysis(analysisHistory, selectedAnalysis)
    return extractAnalysisState(active).stack
  })
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState(false)

  // Filter & passing toggle state
  const [activeFilter, setActiveFilter] = useState('all')
  const [showPassed, setShowPassed] = useState(false)

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
    setHealth(null)
    setFramework(null)
    setMonorepo(false)
    setStack([])
    setDiagnosticsError(false)
    setIsDiagnosticsLoading(true)
    setActiveFilter('all')
    setShowPassed(false)

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
      setFramework(data.framework || null)
      setMonorepo(Boolean(data.monorepo))

      const normalizedStack = normalizeTechnologyStack(data.stack, data.framework)
      setStack(normalizedStack)

      const responseHealth = data.health
      if (
        responseHealth &&
        typeof responseHealth.score === 'number' &&
        typeof responseHealth.status === 'string'
      ) {
        setHealth(responseHealth)
        addAnalysisEntry(repositoryData, responseHealth, data.summary, data.diagnostics, {
          framework: data.framework || null,
          monorepo: Boolean(data.monorepo),
          stack: normalizedStack,
        })
        recordProjectAnalysis(repositoryData, responseHealth)
      } else {
        setHealth(null)
      }
    } catch {
      setDiagnosticsError(true)
    } finally {
      setIsDiagnosticsLoading(false)
    }
  }

  function handleAnalysisSuccess(repositoryData) {
    selectAnalysis(null)
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
      state: {
        fromDiagnostic: {
          ...diagnostic,
          framework,
        },
        repositoryName: repository?.fullName || null,
      },
    })
  }

  function handleViewDiagnosticInVault(diagnostic) {
    const targetRule = diagnostic.ruleId || diagnostic.rule
    const existing = bugs.find((b) => {
      const bugRepo = getBugRepositoryName(b)
      if (repository?.fullName && bugRepo && bugRepo !== repository.fullName) return false
      const bugRule = b.ruleId || b.source?.ruleId || b.source?.diagnosticRule
      return bugRule === targetRule
    })

    if (existing?.id) {
      navigate(`/bug-vault/${existing.id}`)
    } else {
      navigate('/bug-vault')
    }
  }

  // Repository card analysis status text
  const repoAnalysisStatus = useMemo(() => {
    if (!repository?.fullName) {
      return 'Ready for analysis'
    }

    const historyMatch = analysisHistory.find(
      (entry) =>
        entry.repository?.fullName === repository.fullName ||
        entry.repository?.name === repository.name,
    )

    const activeHealth = health || historyMatch?.health
    const timestamp = historyMatch?.analyzedAt

    if (!activeHealth) {
      return 'Ready for analysis'
    }

    const grade = getGrade(activeHealth)
    let timeStr = ''

    if (timestamp) {
      try {
        const date = new Date(timestamp)
        if (!Number.isNaN(date.getTime())) {
          timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      } catch {
        timeStr = ''
      }
    }

    if (timeStr && grade && grade !== 'N/A') {
      return `Analyzed at ${timeStr} • Grade ${grade}`
    }
    if (timeStr) {
      return `Analyzed at ${timeStr}`
    }
    if (grade && grade !== 'N/A') {
      return `Grade ${grade}`
    }

    return 'Ready for analysis'
  }, [repository, health, analysisHistory])

  // Filter calculations
  const filterCounts = useMemo(() => {
    return getFilterCounts(diagnostics)
  }, [diagnostics])

  const visibleDiagnostics = useMemo(() => {
    const filtered = filterDiagnostics(diagnostics, activeFilter)

    if (activeFilter === 'all' && !showPassed) {
      return filtered.filter((d) => normalizeStatus(d.status) !== 'pass')
    }

    return filtered
  }, [diagnostics, activeFilter, showPassed])

  const groupedDiagnostics = useMemo(() => {
    return groupDiagnosticsByCategory(visibleDiagnostics)
  }, [visibleDiagnostics])

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
        <section className="repository-loading-wrap" aria-live="polite">
          <DiagnosticsLoadingSkeleton />
        </section>
      )}

      {repository && (
        <section className="repository-summary" aria-labelledby="repository-summary-title">
          <div className="repository-summary-heading">
            <div>
              <p className="eyebrow">Latest repository</p>
              <h2 id="repository-summary-title">{repository.fullName}</h2>
            </div>
            <span className="repository-ready">{repoAnalysisStatus}</span>
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
            <DiagnosticsErrorState
              onRetry={() => repository && runDiagnostics(repository)}
            />
          )}

          {!isDiagnosticsLoading && !diagnosticsError && (
            <div>
              {health && (
                <DiagnosticsHealthSummary
                  health={health}
                  framework={framework}
                  monorepo={monorepo}
                  diagnostics={diagnostics}
                />
              )}

              {diagnostics.length > 0 && (
                <ScoreBreakdown
                  diagnostics={diagnostics}
                  reportedScore={health?.score}
                />
              )}

              {diagnostics.length > 0 && (
                <div className="diagnostics-checks-area">
                  <DiagnosticsFilterTabs
                    counts={filterCounts}
                    activeFilter={activeFilter}
                    onSelectFilter={setActiveFilter}
                    showPassed={showPassed}
                    onToggleShowPassed={() => setShowPassed((prev) => !prev)}
                  />

                  {visibleDiagnostics.length === 0 ? (
                    <DiagnosticsEmptyState
                      activeFilter={activeFilter}
                      onResetFilter={setActiveFilter}
                    />
                  ) : (
                    <div className="diagnostics-grouped-container" id="passing-diagnostics-group">
                      {groupedDiagnostics.map((group) => (
                        <div key={group.key} className="diagnostic-category-group">
                          <div className="category-group-header">
                            <h3 className="category-group-title">{group.label}</h3>
                            <span className="category-group-count">
                              {group.items.length} {group.items.length === 1 ? 'check' : 'checks'}
                            </span>
                          </div>

                          <div className="category-group-cards">
                            {group.items.map((diagnostic) => (
                              <DiagnosticCard
                                key={diagnostic.ruleId || diagnostic.rule}
                                diagnostic={diagnostic}
                                repositoryName={repository?.fullName}
                                bugs={bugs}
                                onSaveToVault={handleSaveDiagnosticToVault}
                                onViewInVault={handleViewDiagnosticInVault}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            stack.some((tech) => (typeof tech === 'string' ? true : Boolean(tech?.detected))) ? (
              <div className="technology-list">
                {stack
                  .filter((tech) => (typeof tech === 'string' ? true : Boolean(tech?.detected)))
                  .map((tech) => {
                    const techName = typeof tech === 'string' ? tech : tech.name
                    return (
                      <span className="technology-item" key={techName}>
                        {techName}
                      </span>
                    )
                  })}
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
          history={analysisHistory}
          latestRepository={repository}
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
