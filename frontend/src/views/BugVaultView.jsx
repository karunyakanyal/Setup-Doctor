import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import BugForm, { CREATE_CUSTOM_CATEGORY } from '../components/BugForm'
import DeleteBugModal from '../components/DeleteBugModal'
import { useBugVault } from '../hooks/useBugVault'
import { categorizeBug } from '../utils/bugCategorization'
import { findSimilarBugs } from '../utils/bugSimilarity'
import {
  BUG_STATUS_SOLVED,
  BUG_STATUS_UNRESOLVED,
  createBugDraftFromDiagnostic,
  createBugDraftFromSavedBug,
  getBugCategorizationInput,
  getBugRepositoryName,
  getBugSolutionNotes,
  getBugStatus,
  getBugVerifiedSolution,
  getBugSearchText,
  validateBugDraft,
} from '../utils/bugVaultData'

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

function BugVaultView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    bugs,
    customCategories,
    transferMessage,
    setTransferMessage,
    saveBug,
    deleteBug,
    createCategory,
    exportVault,
    importVault,
  } = useBugVault()

  const [isBugFormOpen, setIsBugFormOpen] = useState(() => {
    const fromDiag = Boolean(location.state?.fromDiagnostic)
    const hasEditBug = id ? Boolean(bugs.find((b) => String(b.id) === String(id))) : false
    return fromDiag || hasEditBug
  })

  const [editingBugId, setEditingBugId] = useState(() => {
    return id ? (bugs.find((b) => String(b.id) === String(id))?.id ?? null) : null
  })

  const [bugPendingDeletionId, setBugPendingDeletionId] = useState(null)

  const [similarBugs, setSimilarBugs] = useState(() => {
    if (location.state?.fromDiagnostic) {
      const draft = createBugDraftFromDiagnostic(location.state.fromDiagnostic)
      return findSimilarBugs({
        problem: draft.problem,
        error: draft.error,
        cause: draft.cause,
        suggestedFix: draft.suggestedFix,
        ruleId: draft.ruleId,
        category: draft.category,
        bugs,
        limit: 6,
      })
    }
    return []
  })

  const [bugSearchQuery, setBugSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  const [selectedCategory, setSelectedCategory] = useState(() => {
    const found = id ? bugs.find((b) => String(b.id) === String(id)) : null
    if (found) {
      return String(found.category || categorizeBug(getBugCategorizationInput(found)))
    }
    return ''
  })

  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryMessage, setCategoryMessage] = useState('')
  const [isCategoryMessageError, setIsCategoryMessageError] = useState(false)
  const [bugFormMessage, setBugFormMessage] = useState('')

  const [newBug, setNewBug] = useState(() => {
    const found = id ? bugs.find((b) => String(b.id) === String(id)) : null
    if (found) {
      return createBugDraftFromSavedBug(found)
    }
    if (location.state?.fromDiagnostic) {
      return createBugDraftFromDiagnostic(location.state.fromDiagnostic)
    }
    return {
      problem: '',
      error: '',
      cause: '',
      suggestedFix: '',
      status: BUG_STATUS_UNRESOLVED,
      whatITried: '',
      verifiedSolution: '',
    }
  })

  const formRef = useRef(null)
  const headingRef = useRef(null)
  const similarPanelRef = useRef(null)
  const similarHeadingRef = useRef(null)
  const successBannerRef = useRef(null)
  const shouldScrollRef = useRef(Boolean(location.state?.fromDiagnostic))
  const lastScrolledKeyRef = useRef(null)

  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(() => {
    return location.state?.saveSuccessMessage || ''
  })

  // Debounce search query by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(bugSearchQuery)
    }, 250)

    return () => clearTimeout(timer)
  }, [bugSearchQuery])

  // Automatically scroll into view and focus when arriving from a diagnostic
  useEffect(() => {
    const isFromDiag = Boolean(location.state?.fromDiagnostic)
    const isNewNav = isFromDiag && lastScrolledKeyRef.current !== location.key

    if (isBugFormOpen && (isNewNav || shouldScrollRef.current)) {
      if (isNewNav) {
        lastScrolledKeyRef.current = location.key
      }
      shouldScrollRef.current = false

      const hasSimilar = similarBugs && similarBugs.length > 0
      if (hasSimilar && similarPanelRef.current) {
        if (typeof similarPanelRef.current.scrollIntoView === 'function') {
          similarPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        if (similarHeadingRef.current && typeof similarHeadingRef.current.focus === 'function') {
          similarHeadingRef.current.focus({ preventScroll: true })
        }
      } else if (formRef.current) {
        if (typeof formRef.current.scrollIntoView === 'function') {
          formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        if (headingRef.current && typeof headingRef.current.focus === 'function') {
          headingRef.current.focus({ preventScroll: true })
        } else {
          const firstInput = formRef.current.querySelector('textarea, input, select')
          if (firstInput && typeof firstInput.focus === 'function') {
            firstInput.focus({ preventScroll: true })
          }
        }
      }
    }
  }, [isBugFormOpen, location.state, location.key, similarBugs])

  // Move focus to save success message when it appears
  useEffect(() => {
    if (saveSuccessMessage && successBannerRef.current) {
      if (typeof successBannerRef.current.focus === 'function') {
        successBannerRef.current.focus({ preventScroll: true })
      }
    }
  }, [saveSuccessMessage])

  // Clear history state to avoid stale success messages on unrelated visits or refresh
  useEffect(() => {
    if (location.state?.saveSuccessMessage) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.saveSuccessMessage, location.pathname, navigate])

  const automaticCategory = useMemo(() => {
    return categorizeBug(getBugCategorizationInput(newBug))
  }, [newBug])

  // Automatically update similar bugs when problem or error changes in open form
  useEffect(() => {
    if (!isBugFormOpen || editingBugId !== null) {
      return
    }

    const trimmedProblem = (newBug.problem || '').trim()
    const trimmedError = (newBug.error || '').trim()

    const timer = setTimeout(() => {
      if (!trimmedProblem && !trimmedError) {
        setSimilarBugs([])
        return
      }
      const matches = findSimilarBugs({
        problem: trimmedProblem,
        error: trimmedError,
        cause: (newBug.cause || '').trim(),
        suggestedFix: (newBug.suggestedFix || '').trim(),
        ruleId: location.state?.fromDiagnostic?.ruleId || location.state?.fromDiagnostic?.rule || newBug.ruleId || '',
        category: selectedCategory || newBug.category || automaticCategory || '',
        bugs,
        limit: 6,
      })
      setSimilarBugs(matches)
    }, 250)

    return () => clearTimeout(timer)
  }, [isBugFormOpen, editingBugId, newBug.problem, newBug.error, newBug.cause, newBug.suggestedFix, newBug.ruleId, newBug.category, selectedCategory, automaticCategory, bugs, location.state])

  const normalizedBugSearch = useMemo(() => {
    return debouncedSearchQuery.trim().replace(/\s+/g, ' ').toLowerCase()
  }, [debouncedSearchQuery])

  const visibleBugs = useMemo(() => {
    if (!normalizedBugSearch) {
      return bugs
    }
    return bugs.filter((bug) => {
      return getBugSearchText({
        ...bug,
        category: bug.category || categorizeBug(getBugCategorizationInput(bug)),
      }).includes(normalizedBugSearch)
    })
  }, [bugs, normalizedBugSearch])

  function handleCancelBugForm() {
    setIsBugFormOpen(false)
    setEditingBugId(null)
    setIsDetailsOpen(false)
    setIsSubmitting(false)
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

    if (id) {
      navigate('/bug-vault', { replace: true })
    }
  }

  function handleToggleBugForm() {
    if (isBugFormOpen) {
      handleCancelBugForm()
      return
    }

    setSaveSuccessMessage('')
    setEditingBugId(null)
    setIsDetailsOpen(false)
    setIsSubmitting(false)
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
    shouldScrollRef.current = true
    setIsBugFormOpen(true)
  }

  function handleSaveBug(event) {
    if (event?.preventDefault) {
      event.preventDefault()
    }

    if (isSubmitting) {
      return
    }

    if (selectedCategory === CREATE_CUSTOM_CATEGORY) {
      setCategoryMessage('Create or select a category before saving.')
      setIsCategoryMessageError(true)
      return
    }

    const validationError = validateBugDraft(newBug)
    if (validationError) {
      if (validationError === 'solution-required') {
        setIsDetailsOpen(true)
        setBugFormMessage('Add the verified solution before marking this problem solved.')
      } else if (validationError === 'error-required') {
        setBugFormMessage('Enter an error or description before saving.')
      } else {
        setBugFormMessage('Enter a problem before saving.')
      }
      return
    }

    setBugFormMessage('')
    setSaveSuccessMessage('')
    setIsSubmitting(true)
    try {
      const draftWithCategory = {
        ...newBug,
        category: selectedCategory || automaticCategory,
      }

      const successMsg = (editingBugId === null && !id)
        ? 'Problem saved to Bug Vault successfully.'
        : 'Changes saved successfully.'

      const saveResult = saveBug(draftWithCategory, editingBugId, location.state?.repositoryName || null)

      if (!saveResult || !saveResult.success) {
        setBugFormMessage('Failed to save to local storage. Check browser storage permissions or quota.')
        return
      }

      if (id || editingBugId !== null) {
        navigate('/bug-vault', {
          replace: true,
          state: { saveSuccessMessage: successMsg },
        })
      } else {
        handleCancelBugForm()
        setSaveSuccessMessage(successMsg)
      }
    } catch {
      setBugFormMessage('Failed to save to local storage. Check browser storage permissions or quota.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleStartBugEdit(bug) {
    navigate(`/bug-vault/${bug.id}`)
  }

  function handleConfirmDelete() {
    if (bugPendingDeletionId !== null) {
      deleteBug(bugPendingDeletionId)
      if (editingBugId === bugPendingDeletionId) {
        handleCancelBugForm()
      }
      setBugPendingDeletionId(null)
    }
  }

  function handleCreateCustomCategory() {
    const result = createCategory(newCategoryName)

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

    setSelectedCategory(result.category)
    setNewCategoryName('')
    setCategoryMessage('')
    setIsCategoryMessageError(false)
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text === 'string') {
        importVault(text)
      }
      event.target.value = ''
    }
    reader.readAsText(file)
  }

  const bugToDelete = useMemo(() => {
    return bugs.find((b) => b.id === bugPendingDeletionId) || null
  }, [bugs, bugPendingDeletionId])

  return (
    <section aria-labelledby="bug-vault-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Developer Memory</p>
          <h1 id="bug-vault-title">Bug Vault</h1>
          <p className="welcome-copy">
            Save problems and solutions so you don&apos;t have to solve the same issue twice.
          </p>
        </div>

        <div className="bug-vault-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={exportVault}
          >
            Export
          </button>
          <label className="secondary-button bug-vault-transfer-btn" htmlFor="bug-vault-import-file">
            Import
            <input
              id="bug-vault-import-file"
              name="importFile"
              type="file"
              accept=".json"
              aria-label="Import Bug Vault JSON file"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </label>
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
      </div>

      {transferMessage && (
        <div className="bug-vault-transfer-message" role="status">
          <span>{transferMessage}</span>
          <button
            className="bug-vault-transfer-dismiss"
            type="button"
            aria-label="Dismiss message"
            onClick={() => setTransferMessage('')}
          >
            &times;
          </button>
        </div>
      )}

      {saveSuccessMessage && (
        <div
          className="bug-vault-save-success"
          role="status"
          tabIndex={-1}
          ref={successBannerRef}
        >
          <span>{saveSuccessMessage}</span>
          <button
            className="bug-vault-transfer-dismiss"
            type="button"
            aria-label="Dismiss success message"
            onClick={() => setSaveSuccessMessage('')}
          >
            &times;
          </button>
        </div>
      )}

      <div className="bug-vault-search">
        <div className="bug-search-field">
          <input
            id="bug-vault-search"
            name="searchQuery"
            type="search"
            aria-label="Search bugs"
            placeholder="Search problems, errors, causes, solutions..."
            value={bugSearchQuery}
            onChange={(event) => setBugSearchQuery(event.target.value)}
          />
          {bugSearchQuery && (
            <button
              className="bug-search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setBugSearchQuery('')
                setDebouncedSearchQuery('')
              }}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
        {normalizedBugSearch && (
          <p className="bug-search-count" role="status" aria-live="polite">
            {visibleBugs.length} {visibleBugs.length === 1 ? 'problem' : 'problems'} found
          </p>
        )}
      </div>

      {isBugFormOpen && (
        <BugForm
          formRef={formRef}
          headingRef={headingRef}
          similarPanelRef={similarPanelRef}
          similarHeadingRef={similarHeadingRef}
          newBug={newBug}
          setNewBug={setNewBug}
          editingBugId={editingBugId}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          categoryMessage={categoryMessage}
          setCategoryMessage={setCategoryMessage}
          isCategoryMessageError={isCategoryMessageError}
          setIsCategoryMessageError={setIsCategoryMessageError}
          bugFormMessage={bugFormMessage}
          setBugFormMessage={setBugFormMessage}
          customCategories={customCategories}
          automaticCategory={automaticCategory}
          similarBugs={similarBugs}
          isDetailsOpen={isDetailsOpen}
          setIsDetailsOpen={setIsDetailsOpen}
          isSubmitting={isSubmitting}
          onSubmit={handleSaveBug}
          onCancel={handleCancelBugForm}
          onSaveAnyway={handleSaveBug}
          onCreateCustomCategory={handleCreateCustomCategory}
        />
      )}

      <DeleteBugModal
        isOpen={bugPendingDeletionId !== null}
        bug={bugToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setBugPendingDeletionId(null)}
      />

      {!bugs.length && !isBugFormOpen && !normalizedBugSearch && (
        <div className="repository-summary bug-vault-empty">
          <h2>No problems saved yet</h2>
          <p className="welcome-copy">
            Save your first problem and its solution.
          </p>
        </div>
      )}

      {bugs.length > 0 && normalizedBugSearch && !visibleBugs.length && (
        <div className="repository-summary bug-vault-empty bug-vault-no-results">
          <h2>No matching problems found</h2>
          <p className="welcome-copy">
            Try searching by an error, problem, solution, or repository name.
          </p>
        </div>
      )}

      {bugs.length === 0 && normalizedBugSearch && !isBugFormOpen && (
        <div className="repository-summary bug-vault-empty bug-vault-no-results">
          <h2>No matching problems found</h2>
          <p className="welcome-copy">
            Try searching by an error, problem, solution, or repository name.
          </p>
        </div>
      )}

      <div className="bug-vault-list">
        {visibleBugs.map((bug) => (
          <article className="repository-summary bug-vault-card" key={bug.id}>
            <header className="bug-card-header">
              <div className="bug-card-heading">
                <p className="eyebrow">Saved Problem</p>
                <h2 className="bug-card-title">
                  {highlightBugMatches(bug.problem, normalizedBugSearch)}
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
                  Saved {new Date(bug.createdAt).toLocaleString()}
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
                  <p>{highlightBugMatches(bug.error, normalizedBugSearch)}</p>
                </section>
              )}

              {bug.cause && (
                <section className="bug-detail-section">
                  <h3>Cause</h3>
                  <p>{highlightBugMatches(bug.cause, normalizedBugSearch)}</p>
                </section>
              )}

              {bug.suggestedFix && (
                <section className="bug-detail-section">
                  <h3>Suggested Fix</h3>
                  <p>{highlightBugMatches(bug.suggestedFix, normalizedBugSearch)}</p>
                </section>
              )}

              {bug.whatITried && (
                <section className="bug-detail-section">
                  <h3>What I Tried</h3>
                  <p>{highlightBugMatches(bug.whatITried, normalizedBugSearch)}</p>
                </section>
              )}

              {getBugVerifiedSolution(bug) ? (
                <section className="bug-detail-section bug-solution-section">
                  <h3>Verified Solution</h3>
                  <p>{highlightBugMatches(getBugVerifiedSolution(bug), normalizedBugSearch)}</p>
                </section>
              ) : getBugSolutionNotes(bug) ? (
                <section className="bug-detail-section bug-solution-section">
                  <h3>Solution Notes</h3>
                  <p>{highlightBugMatches(getBugSolutionNotes(bug), normalizedBugSearch)}</p>
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
  )
}

export default BugVaultView
