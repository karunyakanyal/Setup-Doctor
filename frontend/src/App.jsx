import { useEffect, useState } from 'react'
import './App.css'
import AnalyzeRepositoryModal from './components/AnalyzeRepositoryModal'
import Header from './components/Header'
import RecentAnalyses from './components/RecentAnalyses'
import Sidebar from './components/Sidebar'
import StatCard from './components/StatCard'
import {
  addCustomCategory,
  loadCustomCategories,
  saveCustomCategories,
  SYSTEM_CATEGORIES,
} from './utils/bugCategories'
import { categorizeBug } from './utils/bugCategorization'
import { findSimilarBugs } from './utils/bugSimilarity'
import {
  BUG_STATUS_SOLVED,
  BUG_STATUS_UNRESOLVED,
  createBugRecord,
  createBugDraftFromDiagnostic,
  createBugDraftFromSavedBug,
  getBugCategorizationInput,
  getBugRepositoryName,
  getBugSolutionNotes,
  getBugStatus,
  getBugVerifiedSolution,
  getBugSearchText,
  updateBugDraftStatus,
  validateBugDraft,
} from './utils/bugVaultData'

const HISTORY_STORAGE_KEY = 'setupdoctor-history'
const PROJECTS_STORAGE_KEY = 'setupdoctor-projects'
const BUG_VAULT_STORAGE_KEY = 'setupdoctor-bug-vault'
const CREATE_CUSTOM_CATEGORY = '__create_custom_category__'

function highlightBugMatches(value, query) {
  const text = value == null ? '' : String(value)

  if (!query || !text) {
    return text
  }

  const expression = query
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  const matcher = new RegExp(expression, 'gi')
  const highlightedText = []
  let cursor = 0
  let match

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) {
      highlightedText.push(text.slice(cursor, match.index))
    }

    highlightedText.push(
      <mark
        className="bug-search-match"
        key={`${match.index}-${matcher.lastIndex}`}
      >
        {match[0]}
      </mark>,
    )
    cursor = matcher.lastIndex
  }

  if (cursor === 0) {
    return text
  }

  highlightedText.push(text.slice(cursor))
  return highlightedText
}

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [user] = useState({ name: 'Alex Kim', initials: 'AK' })

  const [repository, setRepository] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [diagnosticsSummary, setDiagnosticsSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [stack, setStack] = useState([])

  const [analysisHistory, setAnalysisHistory] = useState(() => {
    try {
      const storedHistory =
        window.localStorage.getItem(HISTORY_STORAGE_KEY)

      const parsedHistory = storedHistory
        ? JSON.parse(storedHistory)
        : []

      return Array.isArray(parsedHistory)
        ? parsedHistory
        : []
    } catch {
      return []
    }
  })

  const [projects, setProjects] = useState(() => {
    try {
      const storedProjects =
        window.localStorage.getItem(PROJECTS_STORAGE_KEY)

      const parsedProjects = storedProjects
        ? JSON.parse(storedProjects)
        : []

      return Array.isArray(parsedProjects)
        ? parsedProjects
        : []
    } catch {
      return []
    }
  })

  const [bugs, setBugs] = useState(() => {
    try {
      const storedBugs =
        window.localStorage.getItem(BUG_VAULT_STORAGE_KEY)

      const parsedBugs = storedBugs
        ? JSON.parse(storedBugs)
        : []

      return Array.isArray(parsedBugs)
        ? parsedBugs
        : []
    } catch {
      return []
    }
  })

  const [customCategories, setCustomCategories] = useState(
    loadCustomCategories,
  )
  const [isBugFormOpen, setIsBugFormOpen] = useState(false)
  const [editingBugId, setEditingBugId] = useState(null)
  const [bugPendingDeletionId, setBugPendingDeletionId] = useState(null)
  const [similarBugs, setSimilarBugs] = useState([])
  const [bugSearchQuery, setBugSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryMessage, setCategoryMessage] = useState('')
  const [isCategoryMessageError, setIsCategoryMessageError] = useState(false)
  const [bugFormMessage, setBugFormMessage] = useState('')

  const [newBug, setNewBug] = useState({
    problem: '',
    error: '',
    cause: '',
    suggestedFix: '',
    status: BUG_STATUS_UNRESOLVED,
    whatITried: '',
    verifiedSolution: '',
  })

  const [isDiagnosticsLoading, setIsDiagnosticsLoading] =
    useState(false)

  const [diagnosticsError, setDiagnosticsError] =
    useState(false)

  const normalizedBugSearch = bugSearchQuery
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

  const visibleBugs = normalizedBugSearch
    ? bugs.filter((bug) => {
        return getBugSearchText({
          ...bug,
          category: bug.category || categorizeBug(getBugCategorizationInput(bug)),
        }).includes(normalizedBugSearch)
      })
    : bugs
  const automaticCategory = categorizeBug(getBugCategorizationInput(newBug))

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

  useEffect(() => {
    if (activePage === 'bug-vault') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [activePage])

  useEffect(() => {
    if (bugPendingDeletionId === null) {
      return undefined
    }

    function handleDeleteDialogKeydown(event) {
      if (event.key === 'Escape') {
        setBugPendingDeletionId(null)
        return
      }

      if (event.key === 'Tab') {
        const dialogButtons = window.document.querySelectorAll(
          '.bug-confirm-dialog button:not([disabled])',
        )
        const firstButton = dialogButtons[0]
        const lastButton = dialogButtons[dialogButtons.length - 1]

        if (event.shiftKey && window.document.activeElement === firstButton) {
          event.preventDefault()
          lastButton?.focus()
        } else if (!event.shiftKey && window.document.activeElement === lastButton) {
          event.preventDefault()
          firstButton?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleDeleteDialogKeydown)
    return () =>
      window.removeEventListener('keydown', handleDeleteDialogKeydown)
  }, [bugPendingDeletionId])

  async function runDiagnostics(repositoryData) {
    setDiagnostics([])
    setDiagnosticsSummary(null)
    setHealth(null)
    setStack([])
    setDiagnosticsError(false)
    setIsDiagnosticsLoading(true)

    try {
      const response = await fetch(
        '/api/repository/diagnose',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            owner: repositoryData.owner,
            repo: repositoryData.name,
            branch: repositoryData.defaultBranch,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error('Diagnostic request failed')
      }

      setDiagnostics(
        Array.isArray(data.diagnostics)
          ? data.diagnostics
          : [],
      )

      setDiagnosticsSummary(data.summary || null)

      const responseHealth = data.health

      setHealth(
        responseHealth &&
          typeof responseHealth.score === 'number' &&
          typeof responseHealth.status === 'string'
          ? responseHealth
          : null,
      )

      setStack(
        Array.isArray(data.stack)
          ? data.stack
          : [],
      )

      if (
        responseHealth &&
        typeof responseHealth.score === 'number' &&
        typeof responseHealth.status === 'string'
      ) {
        const historyEntry = {
          repository: repositoryData,
          health: responseHealth,
          summary: data.summary || null,
          diagnostics: data.diagnostics || [],
          analyzedAt: new Date().toISOString(),
        }

        setAnalysisHistory((currentHistory) => {
          const nextHistory = [
            historyEntry,
            ...currentHistory,
          ].slice(0, 5)

          try {
            window.localStorage.setItem(
              HISTORY_STORAGE_KEY,
              JSON.stringify(nextHistory),
            )
          } catch {
            return nextHistory
          }

          return nextHistory
        })

        setProjects((currentProjects) => {
          const lastAnalyzedAt =
            new Date().toISOString()

          const projectIndex =
            currentProjects.findIndex(
              (project) =>
                project.repository?.fullName ===
                repositoryData.fullName,
            )

          const nextProjects =
            projectIndex === -1
              ? [
                  ...currentProjects,
                  {
                    repository: repositoryData,
                    health: responseHealth,
                    lastAnalyzedAt,
                    analysisCount: 1,
                  },
                ]
              : currentProjects.map(
                  (project, index) =>
                    index === projectIndex
                      ? {
                          ...project,
                          health: responseHealth,
                          lastAnalyzedAt,
                          analysisCount:
                            project.analysisCount + 1,
                        }
                      : project,
                )

          try {
            window.localStorage.setItem(
              PROJECTS_STORAGE_KEY,
              JSON.stringify(nextProjects),
            )
          } catch {
            return nextProjects
          }

          return nextProjects
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

  function handleNavigation(page) {
    setActivePage(page)
  }

  function handleSelectAnalysis(analysis) {
    setSelectedAnalysis(analysis)
  }

  function handleSelectProject(project) {
    const projectFullName =
      project.repository?.fullName

    const latestAnalysis =
      analysisHistory.find(
        (analysis) =>
          analysis.repository?.fullName ===
          projectFullName,
      )

    setSelectedAnalysis(
      latestAnalysis || null,
    )

    setActivePage('history')
  }

  /*
   * Save a manually entered bug to Bug Vault.
   */
  function handleSaveBug(event) {
    event.preventDefault()

    if (selectedCategory === CREATE_CUSTOM_CATEGORY) {
      setCategoryMessage('Create or select a category before saving.')
      setIsCategoryMessageError(true)
      return
    }

    const validationError = validateBugDraft(newBug)
    if (validationError) {
      setBugFormMessage(
        validationError === 'solution-required'
          ? 'Add the verified solution before marking this problem solved.'
          : 'Enter a problem before saving.',
      )
      return
    }

    const savedAt = new Date().toISOString()
    const existingBug = editingBugId === null
      ? null
      : bugs.find((bug) => bug.id === editingBugId)
    const bugFields = createBugRecord({
      ...newBug,
      problem: newBug.problem.trim(),
      error: newBug.error.trim(),
      cause: newBug.cause.trim(),
      suggestedFix: newBug.suggestedFix.trim(),
      whatITried: newBug.whatITried.trim(),
      verifiedSolution: newBug.verifiedSolution.trim(),
      category: selectedCategory || automaticCategory,
      repository: editingBugId === null
        ? repository?.fullName || null
        : existingBug?.repository ?? newBug.repository,
    }, {
      id: editingBugId === null ? Date.now() : existingBug?.id ?? editingBugId,
      createdAt: editingBugId === null
        ? savedAt
        : existingBug?.createdAt ?? newBug.createdAt ?? savedAt,
      updatedAt: editingBugId === null ? null : savedAt,
    })

    setBugs((currentBugs) => {
      const nextBugs = editingBugId === null
        ? [
            {
              ...bugFields,
            },
            ...currentBugs,
          ]
        : currentBugs.map((bug) =>
            bug.id === editingBugId
              ? { ...bug, ...bugFields, updatedAt: savedAt }
              : bug,
          )

      try {
        window.localStorage.setItem(
          BUG_VAULT_STORAGE_KEY,
          JSON.stringify(nextBugs),
        )
      } catch {
        // Keep the bug in the current session.
      }

      return nextBugs
    })

    handleCancelBugForm()
  }

  function handleStartBugEdit(bug) {
    setNewBug(createBugDraftFromSavedBug(bug))
    setSelectedCategory(String(
      bug.category || categorizeBug(getBugCategorizationInput(bug)),
    ))
    setNewCategoryName('')
    setCategoryMessage('')
    setIsCategoryMessageError(false)
    setBugFormMessage('')
    setEditingBugId(bug.id)
    setSimilarBugs([])
    setIsBugFormOpen(true)
  }

  function handleCancelBugForm() {
    setIsBugFormOpen(false)
    setEditingBugId(null)
    setNewBug({
      problem: '',
      error: '',
      cause: '',
      suggestedFix: '',
      status: BUG_STATUS_UNRESOLVED,
      whatITried: '',
      verifiedSolution: '',
    })
    setSelectedCategory('')
    setNewCategoryName('')
    setCategoryMessage('')
    setIsCategoryMessageError(false)
    setBugFormMessage('')
    setSimilarBugs([])
  }

  function handleToggleBugForm() {
    if (isBugFormOpen) {
      handleCancelBugForm()
      return
    }

    setEditingBugId(null)
    setNewBug({
      problem: '',
      error: '',
      cause: '',
      suggestedFix: '',
      status: BUG_STATUS_UNRESOLVED,
      whatITried: '',
      verifiedSolution: '',
    })
    setSelectedCategory('')
    setNewCategoryName('')
    setCategoryMessage('')
    setIsCategoryMessageError(false)
    setBugFormMessage('')
    setSimilarBugs([])
    setIsBugFormOpen(true)
  }

  function handleDeleteBug() {
    if (bugPendingDeletionId === null) {
      return
    }

    const deletedBugId = bugPendingDeletionId
    setBugs((currentBugs) => {
      const nextBugs = currentBugs.filter((bug) => bug.id !== deletedBugId)

      if (nextBugs.length !== currentBugs.length) {
        try {
          window.localStorage.setItem(
            BUG_VAULT_STORAGE_KEY,
            JSON.stringify(nextBugs),
          )
        } catch {
          // Keep the deletion in the current session.
        }
      }

      return nextBugs
    })
    setSimilarBugs((currentSimilarBugs) =>
      currentSimilarBugs.filter(({ bug }) => bug.id !== deletedBugId),
    )
    if (editingBugId === deletedBugId) {
      handleCancelBugForm()
    }
    setBugPendingDeletionId(null)
  }

  function handleCreateCustomCategory() {
    const result = addCustomCategory(customCategories, newCategoryName)

    if (result.status === 'empty') {
      setCategoryMessage('Enter a category name.')
      setIsCategoryMessageError(true)
      return
    }

    if (result.status === 'system-category') {
      setSelectedCategory(result.category)
      setCategoryMessage(`“${result.category}” is a system category and already exists.`)
      setIsCategoryMessageError(false)
      return
    }

    if (result.status === 'exists') {
      setSelectedCategory(result.category)
      setCategoryMessage(`Selected existing category “${result.category}”.`)
      setIsCategoryMessageError(false)
      return
    }

    if (!saveCustomCategories(result.categories)) {
      setCategoryMessage('Could not save the custom category. Please try again.')
      setIsCategoryMessageError(true)
      return
    }

    setCustomCategories(result.categories)
    setSelectedCategory(result.category)
    setNewCategoryName('')
    setCategoryMessage('')
    setIsCategoryMessageError(false)
  }

  /* Start Bug Vault with diagnostic details, keeping recommendations unverified. */
  function handleSaveDiagnosticToVault(diagnostic) {
    setSimilarBugs(findSimilarBugs({
      problem: diagnostic.message || diagnostic.rule || '',
      error: diagnostic.message || '',
      cause: diagnostic.why || '',
      bugs,
      limit: 3,
    }))

    setNewBug(createBugDraftFromDiagnostic(diagnostic))
    setSelectedCategory('')
    setNewCategoryName('')
    setCategoryMessage('')
    setEditingBugId(null)
    setBugFormMessage('')

    setIsBugFormOpen(true)
    setActivePage('bug-vault')
  }

  const issuesFound = analysisHistory.reduce((total, analysis) => {
    if (analysis.summary) {
      const warnings = analysis.summary.warning || 0
      const errors = (analysis.summary.error || 0) + (analysis.summary.failed || 0)
      return total + warnings + errors
    }
    if (Array.isArray(analysis.diagnostics)) {
      const issueCount = analysis.diagnostics.filter(
        (diag) => diag.status === 'warning' || diag.status === 'error' || diag.status === 'failed',
      ).length
      return total + issueCount
    }
    return total
  }, 0)

  const successfulSetups = analysisHistory.filter(
    (analysis) => typeof analysis.health?.score === 'number' && analysis.health.score >= 90,
  ).length

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigation}
      />

      <div className="page-shell">
        <Header activePage={activePage} user={user} />

        <main className="dashboard-main">

          {/* ================= DASHBOARD ================= */}

          {activePage === 'dashboard' ? (
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
                    <span className="wave">
                      &#128075;
                    </span>
                  </h1>

                  <p className="welcome-copy">
                    Get a clear picture of your project
                    setup and resolve issues before they
                    slow you down.
                  </p>
                </div>

                <button
                  className="primary-button"
                  type="button"
                  onClick={() =>
                    setIsModalOpen(true)
                  }
                >
                  <span>+</span>
                  Analyze Repository
                </button>
              </section>

              <section
                className="stats-grid"
                aria-label="Dashboard statistics"
              >
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

              {repository && (
                <section
                  className="repository-summary"
                  aria-labelledby="repository-summary-title"
                >
                  <div className="repository-summary-heading">
                    <div>
                      <p className="eyebrow">
                        Latest repository
                      </p>

                      <h2 id="repository-summary-title">
                        {repository.fullName}
                      </h2>
                    </div>

                    <span className="repository-ready">
                      Ready for analysis
                    </span>
                  </div>

                  <div className="repository-details">
                    <div>
                      <span>Owner</span>
                      <strong>
                        {repository.owner}
                      </strong>
                    </div>

                    <div>
                      <span>Default branch</span>
                      <strong>
                        {repository.defaultBranch}
                      </strong>
                    </div>

                    <div>
                      <span>Language</span>
                      <strong>
                        {repository.language ||
                          'Not specified'}
                      </strong>
                    </div>

                    <div>
                      <span>Stars</span>
                      <strong>
                        {typeof repository.stars ===
                        'number'
                          ? repository.stars.toLocaleString()
                          : 'Not available'}
                      </strong>
                    </div>
                  </div>

                  <p className="repository-description">
                    {repository.description ||
                      'No description provided.'}
                  </p>
                </section>
              )}

              {repository && (
                <section
                  className="repository-health"
                  aria-labelledby="repository-health-title"
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">
                        Setup checks
                      </p>

                      <h2 id="repository-health-title">
                        Repository Health
                      </h2>
                    </div>
                  </div>

                  {isDiagnosticsLoading && (
                    <p className="diagnostics-message">
                      Running diagnostics...
                    </p>
                  )}

                  {diagnosticsError && (
                    <p className="diagnostics-message diagnostics-error">
                      Unable to run diagnostics.
                    </p>
                  )}

                  {!isDiagnosticsLoading &&
                    !diagnosticsError && (
                      <div>
                        {health &&
                          typeof health.score ===
                            'number' &&
                          typeof health.status ===
                            'string' && (
                            <div className="diagnostics-health">
                              <strong>
                                {health.score} / 100
                              </strong>

                              <span
                                className={`health-status health-${health.status
                                  .toLowerCase()
                                  .replace(
                                    /\s+/g,
                                    '-',
                                  )}`}
                              >
                                {health.status}
                              </span>
                            </div>
                          )}

                        {diagnosticsSummary && (
                          <div
                            className="diagnostics-summary"
                            aria-label="Diagnostic summary"
                          >
                            <span>
                              {diagnosticsSummary.total}{' '}
                              Checks
                            </span>

                            <span>
                              {diagnosticsSummary.pass}{' '}
                              Passed
                            </span>

                            <span>
                              {diagnosticsSummary.warning}{' '}
                              Warnings
                            </span>

                            <span>
                              {diagnosticsSummary.error}{' '}
                              Errors
                            </span>
                          </div>
                        )}

                        <div className="diagnostics-list">
                          {diagnostics.map(
                            (diagnostic) => (
                              <div
                                className="diagnostic-row"
                                key={diagnostic.rule}
                              >
                                <span
                                  className={`diagnostic-status ${diagnostic.status}`}
                                >
                                  <span />
                                  {diagnostic.status}
                                </span>

                                <div className="diagnostic-copy">
                                  <span className="diagnostic-message">
                                    {
                                      diagnostic.message
                                    }
                                  </span>

                                  {(
                                    diagnostic.status ===
                                      'warning' ||
                                    diagnostic.status ===
                                      'error'
                                  ) && (
                                    <div className="diagnostic-details">
                                      {typeof diagnostic.why ===
                                        'string' &&
                                        diagnostic.why.trim() && (
                                          <p>
                                            <strong>
                                              Why?
                                            </strong>{' '}
                                            {
                                              diagnostic.why
                                            }
                                          </p>
                                        )}

                                      {typeof diagnostic.recommendation ===
                                        'string' &&
                                        diagnostic.recommendation.trim() && (
                                          <p>
                                            <strong>
                                              Recommendation
                                            </strong>{' '}
                                            {
                                              diagnostic.recommendation
                                            }
                                          </p>
                                        )}

                                      <button
                                        type="button"
                                        className="diagnostic-save-button"
                                        onClick={() =>
                                          handleSaveDiagnosticToVault(
                                            diagnostic,
                                          )
                                        }
                                      >
                                        Save to Bug Vault
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </section>
              )}

              {repository && (
                <section
                  className="technology-stack"
                  aria-labelledby="technology-stack-title"
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">
                        Detected tools
                      </p>

                      <h2 id="technology-stack-title">
                        Technology Stack
                      </h2>
                    </div>
                  </div>

                  {isDiagnosticsLoading && (
                    <p className="diagnostics-message">
                      Detecting technologies...
                    </p>
                  )}

                  {diagnosticsError && (
                    <p className="diagnostics-message diagnostics-error">
                      Unable to detect technologies.
                    </p>
                  )}

                  {!isDiagnosticsLoading &&
                    !diagnosticsError &&
                    (stack.some(
                      (technology) =>
                        technology.detected,
                    ) ? (
                      <div className="technology-list">
                        {stack
                          .filter(
                            (technology) =>
                              technology.detected,
                          )
                          .map((technology) => (
                            <span
                              className="technology-item"
                              key={technology.name}
                            >
                              {technology.name}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <p className="diagnostics-message">
                        No known technologies detected.
                      </p>
                    ))}
                </section>
              )}

              {selectedAnalysis && (
                <section
                  className="selected-analysis"
                  aria-labelledby="selected-analysis-title"
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">
                        History
                      </p>

                      <h2 id="selected-analysis-title">
                        Selected Analysis
                      </h2>
                    </div>
                  </div>

                  <div className="repository-details">
                    <div>
                      <span>Repository</span>
                      <strong>
                        {selectedAnalysis.repository?.fullName ||
                          selectedAnalysis.repository?.name ||
                          'Unknown repository'}
                      </strong>
                    </div>

                    <div>
                      <span>Default branch</span>
                      <strong>
                        {selectedAnalysis.repository
                          ?.defaultBranch ||
                          'Unknown branch'}
                      </strong>
                    </div>

                    <div>
                      <span>Health score</span>
                      <strong>
                        {selectedAnalysis.health?.score ??
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Health status</span>
                      <strong>
                        {selectedAnalysis.health?.status ||
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Total checks</span>
                      <strong>
                        {selectedAnalysis.summary?.total ??
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Passed checks</span>
                      <strong>
                        {selectedAnalysis.summary?.pass ??
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Warnings</span>
                      <strong>
                        {selectedAnalysis.summary?.warning ??
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Errors</span>
                      <strong>
                        {selectedAnalysis.summary?.error ??
                          'Unknown'}
                      </strong>
                    </div>

                    <div>
                      <span>Analyzed</span>
                      <strong>
                        {selectedAnalysis.analyzedAt
                          ? new Date(
                              selectedAnalysis.analyzedAt,
                            ).toLocaleString()
                          : 'Unknown time'}
                      </strong>
                    </div>
                  </div>

                  <h3>Diagnostic Checks</h3>

                  <div className="diagnostic-list">
                    {(
                      Array.isArray(
                        selectedAnalysis.diagnostics,
                      )
                        ? selectedAnalysis.diagnostics
                        : []
                    ).map((diagnostic) => (
                      <div
                        className="diagnostic-row"
                        key={diagnostic.rule}
                      >
                        <span
                          className={`diagnostic-status ${diagnostic.status}`}
                        >
                          <span />
                          {diagnostic.status}
                        </span>

                        <div className="diagnostic-copy">
                          <span className="diagnostic-message">
                            {diagnostic.message}
                          </span>

                          {(
                            diagnostic.status ===
                              'warning' ||
                            diagnostic.status ===
                              'error'
                          ) && (
                            <div className="diagnostic-details">
                              {typeof diagnostic.why ===
                                'string' &&
                                diagnostic.why.trim() && (
                                  <p>
                                    <strong>
                                      Why?
                                    </strong>{' '}
                                    {diagnostic.why}
                                  </p>
                                )}

                              {typeof diagnostic.recommendation ===
                                'string' &&
                                diagnostic.recommendation.trim() && (
                                  <p>
                                    <strong>
                                      Recommendation
                                    </strong>{' '}
                                    {
                                      diagnostic.recommendation
                                    }
                                  </p>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <RecentAnalyses
                history={analysisHistory}
                onSelectAnalysis={
                  handleSelectAnalysis
                }
              />
            </>

          ) : activePage === 'projects' ? (

            /* ================= PROJECTS ================= */

            <section>
              <h1>Projects</h1>

              {projects.length ? (
                projects.map((project) => (
                  <div
                    className="repository-summary"
                    key={
                      project.repository?.fullName
                    }
                    onClick={() =>
                      handleSelectProject(
                        project,
                      )
                    }
                  >
                    <div className="repository-summary-heading">
                      <div>
                        <p className="eyebrow">
                          Repository
                        </p>

                        <h2>
                          {project.repository?.fullName ||
                            'Unknown repository'}
                        </h2>
                      </div>
                    </div>

                    <div className="repository-details">
                      <div>
                        <span>
                          Default branch
                        </span>

                        <strong>
                          {project.repository
                            ?.defaultBranch ||
                            'Unknown branch'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Analysis count
                        </span>

                        <strong>
                          {project.analysisCount}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Last analyzed
                        </span>

                        <strong>
                          {project.lastAnalyzedAt
                            ? new Date(
                                project.lastAnalyzedAt,
                              ).toLocaleString()
                            : 'Unknown time'}
                        </strong>
                      </div>
                    </div>

                    <div className="diagnostics-health">
                      <strong>
                        {project.health?.score ??
                          'Unknown'}{' '}
                        / 100
                      </strong>

                      <span
                        className={`health-status health-${project.health?.status
                          ?.toLowerCase()
                          .replace(
                            /\s+/g,
                            '-',
                          ) || 'unknown'}`}
                      >
                        {project.health?.status ||
                          'Unknown'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p>
                  No projects analyzed yet.
                </p>
              )}
            </section>

          ) : activePage === 'bug-vault' ? (

            /* ================= BUG VAULT ================= */

            <section>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    Developer Memory
                  </p>

                  <h1>Bug Vault</h1>

                  <p className="welcome-copy">
                    Save problems and solutions so you
                    don't have to solve the same issue
                    twice.
                  </p>
                </div>

                <button
                  className="primary-button"
                  type="button"
                  aria-expanded={isBugFormOpen}
                  aria-controls="bug-vault-form"
                  onClick={handleToggleBugForm}
                >
                  {!isBugFormOpen && <span>+</span>}
                  {isBugFormOpen ? 'Close form' : 'Save Bug'}
                </button>
              </div>

              <div className="bug-vault-search">
                <div className="bug-search-field">
                  <input
                    type="search"
                    aria-label="Search saved problems"
                    placeholder="Search problems, errors, causes, solutions..."
                    value={bugSearchQuery}
                    onChange={(event) =>
                      setBugSearchQuery(event.target.value)
                    }
                  />
                  {bugSearchQuery && (
                    <button
                      className="bug-search-clear"
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setBugSearchQuery('')}
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  )}
                </div>
                {normalizedBugSearch && (
                  <p className="bug-search-count" role="status" aria-live="polite">
                    {visibleBugs.length}{' '}
                    {visibleBugs.length === 1 ? 'problem' : 'problems'} found
                  </p>
                )}
              </div>

              {isBugFormOpen && similarBugs.length > 0 && (
                <section className="repository-summary similar-bugs">
                  <h2>Similar Problem Found</h2>
                  {similarBugs.map(({ bug }) => (
                    <article className="similar-bug-item" key={bug.id}>
                      <h3>{bug.problem}</h3>
                      {bug.error && (
                        <p><strong>Error:</strong> {bug.error}</p>
                      )}
                      {bug.suggestedFix && (
                        <p><strong>Suggested Fix:</strong> {bug.suggestedFix}</p>
                      )}
                      {bug.whatITried && (
                        <p><strong>What I Tried:</strong> {bug.whatITried}</p>
                      )}
                      {getBugVerifiedSolution(bug) && (
                        <p>
                          <strong>Verified Solution:</strong>{' '}
                          {getBugVerifiedSolution(bug)}
                        </p>
                      )}
                      {getBugSolutionNotes(bug) && (
                        <p>
                          <strong>Solution Notes:</strong>{' '}
                          {getBugSolutionNotes(bug)}
                        </p>
                      )}
                    </article>
                  ))}
                </section>
              )}

              {isBugFormOpen && (
                <form
                  id="bug-vault-form"
                  className="repository-summary bug-vault-form"
                  onSubmit={handleSaveBug}
                >
                  <h2>
                    {editingBugId === null ? 'Save a Problem' : 'Edit Saved Problem'}
                  </h2>

                  <div className="bug-form-grid">
                    <label>
                      Problem

                      <textarea
                        className="bug-textarea-problem"
                        rows={3}
                        value={newBug.problem}
                        onChange={(event) =>
                          setNewBug(
                            (current) => ({
                              ...current,
                              problem:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="Example: Node version mismatch"
                        required
                      />
                    </label>

                    <label>
                      Error

                      <textarea
                        className="bug-textarea-error"
                        rows={4}
                        value={newBug.error}
                        onChange={(event) =>
                          setNewBug(
                            (current) => ({
                              ...current,
                              error:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="Paste the error message"
                      />
                    </label>

                    <label>
                      Cause

                      <textarea
                        className="bug-textarea-cause"
                        rows={3}
                        value={newBug.cause}
                        onChange={(event) =>
                          setNewBug(
                            (current) => ({
                              ...current,
                              cause:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="What caused the problem?"
                      />
                    </label>

                    <label>
                      Suggested Fix

                      <textarea
                        className="bug-textarea-suggested-fix"
                        value={newBug.suggestedFix}
                        onChange={(event) =>
                          setNewBug(
                            (current) => ({
                              ...current,
                              suggestedFix:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="Recommendation from SetupDoctor or your own suggested next step."
                      />
                    </label>

                    <label>
                      Status

                      <select
                        value={newBug.status}
                        onChange={(event) => {
                          setNewBug((current) =>
                            updateBugDraftStatus(current, event.target.value),
                          )
                          setBugFormMessage('')
                        }}
                      >
                        <option value={BUG_STATUS_UNRESOLVED}>Unresolved</option>
                        <option value={BUG_STATUS_SOLVED}>Solved</option>
                      </select>
                    </label>

                    <label>
                      What I Tried

                      <textarea
                        className="bug-textarea-what-tried"
                        value={newBug.whatITried}
                        onChange={(event) =>
                          setNewBug((current) => ({
                            ...current,
                            whatITried: event.target.value,
                          }))
                        }
                        placeholder="What did you try while solving it?"
                      />
                    </label>

                    <label>
                      {newBug.status === BUG_STATUS_SOLVED
                        ? 'Verified Solution *'
                        : 'Verified Solution'}

                      <textarea
                        className="bug-textarea-verified-solution"
                        value={newBug.verifiedSolution}
                        onChange={(event) => {
                          setNewBug((current) => ({
                            ...current,
                            verifiedSolution: event.target.value,
                          }))
                          setBugFormMessage('')
                        }}
                        placeholder="What actually fixed the problem?"
                        aria-required={newBug.status === BUG_STATUS_SOLVED}
                        required={newBug.status === BUG_STATUS_SOLVED}
                        onInvalid={() =>
                          setBugFormMessage(
                            'Add the verified solution before marking this problem solved.',
                          )
                        }
                      />
                    </label>

                    <label>
                      Category

                      <select
                        value={selectedCategory || automaticCategory}
                        onChange={(event) => {
                          const { value } = event.target
                          setSelectedCategory(value)
                          setCategoryMessage('')
                          setIsCategoryMessageError(false)
                          if (value === CREATE_CUSTOM_CATEGORY) {
                            setNewCategoryName('')
                          }
                        }}
                      >
                        <optgroup label="System categories">
                          {SYSTEM_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}{category === automaticCategory ? ' (automatic)' : ''}
                            </option>
                          ))}
                        </optgroup>
                        {customCategories.length > 0 && (
                          <optgroup label="Custom categories">
                            {customCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value={CREATE_CUSTOM_CATEGORY}>
                          Create custom category...
                        </option>
                      </select>
                      <span className="category-auto-note">
                        Automatic: {automaticCategory}
                      </span>
                    </label>

                    {selectedCategory === CREATE_CUSTOM_CATEGORY && (
                      <div className="custom-category-entry">
                        <label htmlFor="new-custom-category">
                          New category
                          <input
                            id="new-custom-category"
                            type="text"
                            value={newCategoryName}
                            onChange={(event) => {
                              setNewCategoryName(event.target.value)
                              setCategoryMessage('')
                              setIsCategoryMessageError(false)
                            }}
                            placeholder="Example: Docker"
                          />
                        </label>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={handleCreateCustomCategory}
                        >
                          Add category
                        </button>
                      </div>
                    )}
                  </div>

                  {bugFormMessage && (
                    <p className="bug-form-feedback has-error" role="alert">
                      {bugFormMessage}
                    </p>
                  )}

                  {categoryMessage && (
                      <p
                        className={`category-feedback${isCategoryMessageError ? ' has-error' : ''}`}
                        role={isCategoryMessageError ? 'alert' : 'status'}
                      >
                        {categoryMessage}
                      </p>
                  )}

                  <div className="bug-form-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleCancelBugForm}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                    >
                      {editingBugId === null ? 'Save to Bug Vault' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {bugPendingDeletionId !== null && (
                <div className="bug-confirm-backdrop">
                  <section
                    className="bug-confirm-dialog"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="bug-delete-title"
                    aria-describedby="bug-delete-description"
                  >
                    <h2 id="bug-delete-title">Delete saved problem?</h2>
                    <p id="bug-delete-description">
                      “{bugs.find((bug) => bug.id === bugPendingDeletionId)?.problem || 'This saved problem'}” will be deleted. This cannot be undone.
                    </p>
                    <div className="bug-confirm-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Cancel deleting saved problem"
                        autoFocus
                        onClick={() => setBugPendingDeletionId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="bug-delete-confirm"
                        type="button"
                        aria-label="Delete saved problem"
                        onClick={handleDeleteBug}
                      >
                        Delete
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {!bugs.length &&
                !isBugFormOpen &&
                !normalizedBugSearch && (
                  <div className="repository-summary bug-vault-empty">
                    <h2>
                      No problems saved yet
                    </h2>

                    <p className="welcome-copy">
                      Save your first problem and
                      its solution.
                    </p>
                  </div>
                )}

              {bugs.length > 0 &&
                normalizedBugSearch &&
                !visibleBugs.length && (
                  <div className="repository-summary bug-vault-empty bug-vault-no-results">
                    <h2>No matching problems found</h2>
                    <p className="welcome-copy">
                      Try searching by an error, problem, solution, or repository name.
                    </p>
                  </div>
                )}

              {bugs.length === 0 &&
                normalizedBugSearch &&
                !isBugFormOpen && (
                  <div className="repository-summary bug-vault-empty bug-vault-no-results">
                    <h2>No matching problems found</h2>
                    <p className="welcome-copy">
                      Try searching by an error, problem, solution, or repository name.
                    </p>
                  </div>
                )}

              <div className="bug-vault-list">
                {visibleBugs.map((bug) => (
                  <article
                    className="repository-summary bug-vault-card"
                    key={bug.id}
                  >
                    <header className="bug-card-header">
                      <div className="bug-card-heading">
                        <p className="eyebrow">
                          Saved Problem
                        </p>
                        <h2 className="bug-card-title">
                          {highlightBugMatches(
                            bug.problem,
                            normalizedBugSearch,
                          )}
                        </h2>
                        <span className="bug-card-category">
                          {highlightBugMatches(
                            bug.category || categorizeBug(getBugCategorizationInput(bug)),
                            normalizedBugSearch,
                          )}
                        </span>
                        <span
                          className={`bug-status-badge ${getBugStatus(bug) === BUG_STATUS_SOLVED ? 'bug-status-solved' : 'bug-status-unresolved'}`}
                        >
                          {getBugStatus(bug) === BUG_STATUS_SOLVED ? 'Solved' : 'Unresolved'}
                        </span>
                        {getBugRepositoryName(bug) && (
                          <p className="bug-repository-indicator">
                            <span>Repository</span>
                            {highlightBugMatches(
                              getBugRepositoryName(bug),
                              normalizedBugSearch,
                            )}
                          </p>
                        )}
                      </div>
                      <div className="bug-card-meta">
                        <p className="bug-saved-at">
                          Saved{' '}
                          {new Date(
                            bug.createdAt,
                          ).toLocaleString()}
                        </p>
                        <div className="bug-card-actions">
                          <button
                            className="bug-card-action"
                            type="button"
                            aria-label={`Edit saved problem: ${bug.problem}`}
                            onClick={() => handleStartBugEdit(bug)}
                          >
                            Edit
                          </button>
                          <button
                            className="bug-card-action bug-card-delete"
                            type="button"
                            aria-label={`Delete saved problem: ${bug.problem}`}
                            onClick={() => setBugPendingDeletionId(bug.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </header>

                    <div className="bug-card-details">
                      {bug.error && (
                        <section className="bug-detail-section">
                          <h3>Error</h3>
                          <p>
                            {highlightBugMatches(
                              bug.error,
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      )}

                      {bug.cause && (
                        <section className="bug-detail-section">
                          <h3>Cause</h3>
                          <p>
                            {highlightBugMatches(
                              bug.cause,
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      )}

                      {bug.suggestedFix && (
                        <section className="bug-detail-section">
                          <h3>Suggested Fix</h3>
                          <p>
                            {highlightBugMatches(
                              bug.suggestedFix,
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      )}

                      {bug.whatITried && (
                        <section className="bug-detail-section">
                          <h3>What I Tried</h3>
                          <p>
                            {highlightBugMatches(
                              bug.whatITried,
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      )}

                      {getBugVerifiedSolution(bug) ? (
                        <section className="bug-detail-section bug-solution-section">
                          <h3>Verified Solution</h3>
                          <p>
                            {highlightBugMatches(
                              getBugVerifiedSolution(bug),
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      ) : getBugSolutionNotes(bug) ? (
                        <section className="bug-detail-section bug-solution-section">
                          <h3>Solution Notes</h3>
                          <p>
                            {highlightBugMatches(
                              getBugSolutionNotes(bug),
                              normalizedBugSearch,
                            )}
                          </p>
                        </section>
                      ) : getBugStatus(bug) === BUG_STATUS_UNRESOLVED ? (
                        <section className="bug-detail-section bug-solution-section">
                          <h3>Solution</h3>
                          <p>Not solved yet.</p>
                        </section>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>

          ) : (

            /* ================= HISTORY ================= */

            <section>
              <h1>History</h1>

              {analysisHistory.length ? (
                analysisHistory.map(
                  (analysis) => (
                    <div
                      className="repository-summary"
                      key={`${analysis.repository?.fullName || 'unknown'}-${analysis.analyzedAt}`}
                    >
                      <div className="repository-summary-heading">
                        <div>
                          <p className="eyebrow">
                            Analysis
                          </p>

                          <h2>
                            {analysis.repository
                              ?.fullName ||
                              'Unknown repository'}
                          </h2>
                        </div>
                      </div>

                      <div className="repository-details">
                        <div>
                          <span>
                            Default branch
                          </span>

                          <strong>
                            {analysis.repository
                              ?.defaultBranch ||
                              'Unknown branch'}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Analyzed
                          </span>

                          <strong>
                            {analysis.analyzedAt
                              ? new Date(
                                  analysis.analyzedAt,
                                ).toLocaleString()
                              : 'Unknown time'}
                          </strong>
                        </div>
                      </div>

                      <div className="diagnostics-health">
                        <strong>
                          {analysis.health?.score ??
                            'Unknown'}{' '}
                          / 100
                        </strong>

                        <span
                          className={`health-status health-${analysis.health?.status
                            ?.toLowerCase()
                            .replace(
                              /\s+/g,
                              '-',
                            ) || 'unknown'}`}
                        >
                          {analysis.health?.status ||
                            'Unknown'}
                        </span>
                      </div>

                      <div
                        className="diagnostics-summary"
                        aria-label="Analysis summary"
                      >
                        <span>
                          {analysis.summary
                            ?.total ??
                            'Unknown'}{' '}
                          Checks
                        </span>

                        <span>
                          {analysis.summary
                            ?.warning ??
                            'Unknown'}{' '}
                          Warnings
                        </span>

                        <span>
                          {analysis.summary
                            ?.error ??
                            'Unknown'}{' '}
                          Errors
                        </span>
                      </div>
                    </div>
                  ),
                )
              ) : (
                <p>
                  No analysis history yet.
                </p>
              )}
            </section>
          )}
        </main>
      </div>

      {isModalOpen && (
        <AnalyzeRepositoryModal
          onClose={() =>
            setIsModalOpen(false)
          }
          onSuccess={
            handleAnalysisSuccess
          }
        />
      )}

      {showSuccessToast && (
        <div
          className="success-toast"
          role="status"
        >
          &#10003; Repository added for analysis
        </div>
      )}
    </div>
  )
}

export default App
