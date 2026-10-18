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
import CodeMapPanel from '../components/codemap/CodeMapPanel'
import ProjectGlanceCard from '../components/diagnostics/ProjectGlanceCard'
import WhatToDoNextPanel from '../components/diagnostics/WhatToDoNextPanel'
import {
  filterDiagnostics,
  groupDiagnosticsByCategory,
  getFilterCounts,
  getGrade,
  normalizeStatus,
  resolveLatestAnalysis,
  extractAnalysisState,
  normalizeTechnologyStack,
  createCodeMapSummary,
  countAnalyzedProjects,
  getShortFailureReason,
} from '../utils/diagnosisFormatters'
import { getBugRepositoryName } from '../utils/bugVaultData'

function DashboardView({ user = { name: 'Developer', initials: 'D' } }) {
  const navigate = useNavigate()
  const { projects, recordProjectAnalysis } = useProjects()
  const { bugs } = useBugVault()
  const {
    analysisHistory,
    addAnalysisEntry,
    updateAnalysisCodeMapSummary,
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
  const [diagnosticsError, setDiagnosticsError] = useState(null)

  // Deep scan state
  const [deepScanStatus, setDeepScanStatus] = useState('idle')
  const [deepScanData, setDeepScanData] = useState(null)
  const [deepScanError, setDeepScanError] = useState(null)

  // Filter & passing toggle state
  const [activeFilter, setActiveFilter] = useState('all')
  const [showPassed, setShowPassed] = useState(false)
  const [viewMode, setViewMode] = useState('simple') // 'simple' | 'detailed'

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
    setDiagnosticsError(null)
    setIsDiagnosticsLoading(true)
    setDeepScanData(null)
    setDeepScanError(null)
    setActiveFilter('all')
    setShowPassed(false)
    setViewMode('simple')

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

      let data = null
      try {
        data = await response.json()
      } catch {
        // non-JSON response
      }

      if (!response.ok || !data?.success) {
        let errorMessage = 'We encountered a problem fetching the manifest or tree for this repository. Please verify network connectivity, GitHub access, or branch name.'
        if (data?.code === 'NO_PACKAGE_JSON') {
          errorMessage = 'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.'
        } else if (response.status === 429) {
          errorMessage = data?.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.'
        }

        setDiagnosticsError({
          status: response.status,
          code: data?.code,
          message: errorMessage,
          backendMessage: data?.message,
        })
        return
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

      // Automatically start deep scan in background without blocking diagnostics results
      void runDeepScan(repositoryData)
    } catch (err) {
      setDiagnosticsError({
        message: 'We encountered a problem fetching the manifest or tree for this repository. Please verify network connectivity, GitHub access, or branch name.',
        originalError: err?.message,
      })
    } finally {
      setIsDiagnosticsLoading(false)
    }
  }

  async function runDeepScan(repositoryData) {
    if (!repositoryData?.owner || !repositoryData?.name || !repositoryData?.defaultBranch) {
      return
    }

    setDeepScanStatus('scanning')
    setDeepScanError(null)

    try {
      const response = await fetch('/api/repository/graph', {
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

      if (response.status === 413) {
        throw new Error('Repository too large to scan fully')
      }

      if (response.status === 429) {
        const retryAfter = response.headers?.get?.('retry-after')
        const message = retryAfter
          ? `Rate limit exceeded. Try again in ${retryAfter}s.`
          : 'Rate limit exceeded. Please try again later.'
        throw new Error(message)
      }

      if (response.status === 503) {
        throw new Error('Deep scan is busy, try again in a minute')
      }

      if (!response.ok) {
        let errMessage = 'Deep scan request failed'
        try {
          const errData = await response.json()
          if (errData?.message) errMessage = errData.message
        } catch {
          // ignore
        }
        throw new Error(errMessage)
      }

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.message || 'Deep scan request was unsuccessful')
      }

      setDeepScanData(data)
      setDeepScanStatus('success')

      // Save only small summary with analysis in localStorage, NEVER the full graph
      const smallSummary = createCodeMapSummary(data)
      updateAnalysisCodeMapSummary(repositoryData, smallSummary)
    } catch (err) {
      setDeepScanStatus('error')
      setDeepScanError(err.message || 'Network error while running deep scan')
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

  // Repository card analysis status text and failure badge
  const repoAnalysisBadge = useMemo(() => {
    if (!repository?.fullName) {
      return { text: 'Ready for analysis', isFailed: false }
    }

    if (diagnosticsError) {
      const reason = getShortFailureReason(diagnosticsError)
      return { text: `Analysis failed: ${reason}`, isFailed: true }
    }

    const historyMatch = analysisHistory.find(
      (entry) =>
        entry.repository?.fullName === repository.fullName ||
        entry.repository?.name === repository.name,
    )

    const activeHealth = health || historyMatch?.health
    const timestamp = historyMatch?.analyzedAt

    if (!activeHealth) {
      return { text: 'Ready for analysis', isFailed: false }
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
      return { text: `Analyzed at ${timeStr} • Grade ${grade}`, isFailed: false }
    }
    if (timeStr) {
      return { text: `Analyzed at ${timeStr}`, isFailed: false }
    }
    if (grade && grade !== 'N/A') {
      return { text: `Grade ${grade}`, isFailed: false }
    }

    return { text: 'Ready for analysis', isFailed: false }
  }, [repository, health, diagnosticsError, analysisHistory])

  // Count only repositories with successful diagnostics (has an analysis record with a score)
  const analyzedProjectsCount = useMemo(() => {
    return countAnalyzedProjects(projects, analysisHistory)
  }, [projects, analysisHistory])

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
          value={analyzedProjectsCount}
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
            <span className={`repository-ready ${repoAnalysisBadge.isFailed ? 'repository-failed' : ''}`}>
              {repoAnalysisBadge.text}
            </span>
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

      {repository && !isDiagnosticsLoading && !diagnosticsError && (
        <section className="glance-and-actions-section" aria-label="Project overview and action plan">
          <div className="view-mode-control-bar">
            <span className="view-mode-prompt">Display density:</span>
            <div className="view-mode-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'simple' ? 'active' : ''}`}
                onClick={() => setViewMode('simple')}
                aria-pressed={viewMode === 'simple'}
              >
                Simple
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'detailed' ? 'active' : ''}`}
                onClick={() => setViewMode('detailed')}
                aria-pressed={viewMode === 'detailed'}
              >
                Detailed
              </button>
            </div>
          </div>

          <ProjectGlanceCard
            repository={repository}
            health={health}
            framework={framework}
            monorepo={monorepo}
            stack={stack}
            diagnostics={diagnostics}
            deepScanData={deepScanData}
          />

          <WhatToDoNextPanel
            diagnostics={diagnostics}
            deepScanData={deepScanData}
            onInspectFile={() => {
              setViewMode('detailed')
              const el = document.getElementById('codemap-panel-heading') || document.getElementById('technical-details-title')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          />
        </section>
      )}

      {repository && diagnosticsError && (
        <section className="repository-health-error" aria-label="Diagnostics Error">
          <DiagnosticsErrorState
            error={diagnosticsError}
            message={typeof diagnosticsError === 'object' ? diagnosticsError.message : undefined}
            onRetry={() => repository && runDiagnostics(repository)}
          />
        </section>
      )}

      {/* Simple View: Top 3 findings per category */}
      {repository && !isDiagnosticsLoading && !diagnosticsError && viewMode === 'simple' && groupedDiagnostics.length > 0 && (
        <section className="simple-findings-section" aria-labelledby="simple-findings-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Key findings</p>
              <h2 id="simple-findings-title">Top Findings by Category</h2>
            </div>
            <button
              type="button"
              className="btn-secondary view-all-findings-btn"
              onClick={() => setViewMode('detailed')}
            >
              View all checks in Detailed mode
            </button>
          </div>

          <div className="diagnostics-grouped-container">
            {groupedDiagnostics.map((group) => {
              const topItems = group.items.slice(0, 3)
              return (
                <div key={`simple-${group.key}`} className="diagnostic-category-group">
                  <div className="category-group-header">
                    <h3 className="category-group-title">{group.label}</h3>
                    <span className="category-group-count">
                      Showing {topItems.length} of {group.items.length} {group.items.length === 1 ? 'check' : 'checks'}
                    </span>
                  </div>

                  <div className="category-group-cards">
                    {topItems.map((diagnostic) => (
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
              )
            })}
          </div>
        </section>
      )}

      {/* Technical details: Everything that exists today */}
      {repository && !isDiagnosticsLoading && !diagnosticsError && (
        <section className="technical-details" aria-labelledby="technical-details-title">
          <div className="section-heading technical-details-heading-wrap">
            <div>
              <p className="eyebrow">Comprehensive breakdown</p>
              <h2 id="technical-details-title">Technical details</h2>
            </div>
            {viewMode === 'simple' && (
              <button
                type="button"
                className="btn-secondary switch-to-detailed-btn"
                onClick={() => setViewMode('detailed')}
              >
                Expand all technical details
              </button>
            )}
          </div>

          {viewMode === 'detailed' ? (
            <div className="technical-details-content">
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

              <CodeMapPanel
                data={deepScanData}
                status={deepScanStatus}
                error={deepScanError}
                onRerun={() => runDeepScan(repository)}
              />

              <section className="technology-stack" aria-labelledby="technology-stack-title">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Detected tools</p>
                    <h3 id="technology-stack-title">Technology Stack</h3>
                  </div>
                </div>

                {stack.some((tech) => (typeof tech === 'string' ? true : Boolean(tech?.detected))) ? (
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
                )}
              </section>
            </div>
          ) : (
            <details className="technical-details-accordion">
              <summary className="technical-details-summary">
                <strong>Show technical details</strong> (Health summary, score breakdown, all diagnostic checks, code map, and tech stack)
              </summary>
              <div className="technical-details-content">
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
                      <div className="diagnostics-grouped-container" id="passing-diagnostics-group-acc">
                        {groupedDiagnostics.map((group) => (
                          <div key={`acc-${group.key}`} className="diagnostic-category-group">
                            <div className="category-group-header">
                              <h3 className="category-group-title">{group.label}</h3>
                              <span className="category-group-count">
                                {group.items.length} {group.items.length === 1 ? 'check' : 'checks'}
                              </span>
                            </div>

                            <div className="category-group-cards">
                              {group.items.map((diagnostic) => (
                                <DiagnosticCard
                                  key={`acc-${diagnostic.ruleId || diagnostic.rule}`}
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

                <CodeMapPanel
                  data={deepScanData}
                  status={deepScanStatus}
                  error={deepScanError}
                  onRerun={() => runDeepScan(repository)}
                />

                <section className="technology-stack" aria-labelledby="technology-stack-title-acc">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Detected tools</p>
                      <h3 id="technology-stack-title-acc">Technology Stack</h3>
                    </div>
                  </div>

                  {stack.some((tech) => (typeof tech === 'string' ? true : Boolean(tech?.detected))) ? (
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
                  )}
                </section>
              </div>
            </details>
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
          &#10003; Analysis complete
        </div>
      )}
    </>
  )
}

export default DashboardView
