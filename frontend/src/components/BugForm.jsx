import { useState } from 'react'
import {
  SYSTEM_CATEGORIES,
} from '../utils/bugCategories'
import {
  BUG_STATUS_SOLVED,
  BUG_STATUS_UNRESOLVED,
  getBugVerifiedSolution,
  getBugSolutionNotes,
  updateBugDraftStatus,
} from '../utils/bugVaultData'

const CREATE_CUSTOM_CATEGORY = '__create_custom_category__'

function BugForm({
  formRef,
  headingRef,
  similarPanelRef,
  similarHeadingRef,
  newBug,
  setNewBug,
  editingBugId,
  selectedCategory,
  setSelectedCategory,
  newCategoryName,
  setNewCategoryName,
  categoryMessage,
  setCategoryMessage,
  isCategoryMessageError,
  setIsCategoryMessageError,
  bugFormMessage,
  setBugFormMessage,
  customCategories,
  automaticCategory,
  similarBugs,
  isDetailsOpen: propIsDetailsOpen,
  setIsDetailsOpen: propSetIsDetailsOpen,
  isSubmitting = false,
  onSubmit,
  onCancel,
  onSaveAnyway,
  onCreateCustomCategory,
}) {
  const [internalDetailsOpen, setInternalDetailsOpen] = useState(false)
  const isDetailsOpen = propIsDetailsOpen !== undefined ? propIsDetailsOpen : internalDetailsOpen
  const setIsDetailsOpen = propSetIsDetailsOpen || setInternalDetailsOpen

  const likelyDuplicates = (similarBugs || []).filter((item) => item.matchLevel === 'strong')
  const relatedIssues = (similarBugs || []).filter((item) => item.matchLevel === 'related')
  const hasMatches = likelyDuplicates.length > 0 || relatedIssues.length > 0

  let panelHeading = 'Similar Problem Found'
  if (likelyDuplicates.length > 0 && relatedIssues.length > 0) {
    panelHeading = 'Similar Problems & Likely Duplicates Found'
  } else if (likelyDuplicates.length > 0) {
    panelHeading = 'Likely Duplicate Found'
  } else if (relatedIssues.length > 0) {
    panelHeading = 'Related Issues Found'
  }

  return (
    <>
      {hasMatches && (
        <section
          ref={similarPanelRef}
          className="repository-summary similar-bugs"
          aria-label="Similar problems found"
        >
          <div className="similar-bugs-header">
            <h2 tabIndex={-1} ref={similarHeadingRef}>
              {panelHeading}
            </h2>
            <p className="similar-bugs-intro">
              SetupDoctor found {similarBugs.length === 1 ? 'a matching entry' : `${similarBugs.length} matching entries`} in your Bug Vault. Review existing entries or choose to save this problem anyway.
            </p>
          </div>

          {likelyDuplicates.length > 0 && (
            <div className="similar-group-section likely-duplicates-group">
              <div className="similar-group-header">
                <h3 className="similar-group-title duplicate-group-title">
                  Likely Duplicates ({likelyDuplicates.length})
                </h3>
                <p className="similar-group-intro">
                  These entries show strong evidence of the same underlying problem.
                </p>
              </div>
              <div className="similar-group-items">
                {likelyDuplicates.map(({ bug, matchReason, badgeLabel }) => (
                  <article className="similar-bug-item duplicate-item" key={bug.id}>
                    <div className="similar-bug-title-row">
                      <h4>{bug.problem}</h4>
                      <span
                        className="similar-bug-badge badge-strong"
                        title={matchReason || 'Likely duplicate'}
                      >
                        {badgeLabel || 'Likely duplicate'}
                      </span>
                    </div>
                    {matchReason && (
                      <p className="similar-bug-match-reason">{matchReason}</p>
                    )}
                    {bug.error && (
                      <p><strong>Error:</strong> {bug.error}</p>
                    )}
                    {bug.cause && (
                      <p><strong>Cause:</strong> {bug.cause}</p>
                    )}
                    {bug.suggestedFix && (
                      <p><strong>Suggested Fix:</strong> {bug.suggestedFix}</p>
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
              </div>
            </div>
          )}

          {relatedIssues.length > 0 && (
            <div className="similar-group-section related-issues-group">
              <div className="similar-group-header">
                <h3 className="similar-group-title related-group-title">
                  Related Issues ({relatedIssues.length})
                </h3>
                <p className="similar-group-intro">
                  These entries share technologies or symptoms, but their underlying causes may differ.
                </p>
              </div>
              <div className="similar-group-items">
                {relatedIssues.map(({ bug, matchReason, badgeLabel }) => (
                  <article className="similar-bug-item related-item" key={bug.id}>
                    <div className="similar-bug-title-row">
                      <h4>{bug.problem}</h4>
                      <span
                        className="similar-bug-badge badge-related"
                        title={matchReason || 'Related issue'}
                      >
                        {badgeLabel || 'Related issue'}
                      </span>
                    </div>
                    {matchReason && (
                      <p className="similar-bug-match-reason">{matchReason}</p>
                    )}
                    {bug.error && (
                      <p><strong>Error:</strong> {bug.error}</p>
                    )}
                    {bug.cause && (
                      <p><strong>Cause:</strong> {bug.cause}</p>
                    )}
                    {bug.suggestedFix && (
                      <p><strong>Suggested Fix:</strong> {bug.suggestedFix}</p>
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
              </div>
            </div>
          )}
          <div className="similar-bugs-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={onSaveAnyway || onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Anyway'}
            </button>
          </div>
        </section>
      )}

      <form
        id="bug-vault-form"
        ref={formRef}
        className="repository-summary bug-vault-form"
        onSubmit={onSubmit}
        aria-label={editingBugId === null ? 'Save a Problem' : 'Edit Saved Problem'}
      >
        <h2 tabIndex={-1} ref={headingRef}>
          {editingBugId === null ? 'Save a Problem' : 'Edit Saved Problem'}
        </h2>

        {/* Primary / default visible fields */}
        <div className="bug-form-grid bug-form-primary-grid">
          <label>
            Problem Title *
            <textarea
              className="bug-textarea-problem"
              rows={3}
              value={newBug.problem}
              onChange={(event) =>
                setNewBug((current) => ({
                  ...current,
                  problem: event.target.value,
                }))
              }
              placeholder="Example: Node version mismatch"
              required
            />
          </label>

          <label>
            Error / Description *
            <textarea
              className="bug-textarea-error"
              rows={4}
              value={newBug.error}
              onChange={(event) =>
                setNewBug((current) => ({
                  ...current,
                  error: event.target.value,
                }))
              }
              placeholder="Paste the error message or description"
              required
            />
          </label>

          <label className="bug-form-full-width">
            Suggested Fix
            <textarea
              className="bug-textarea-suggested-fix"
              rows={3}
              value={newBug.suggestedFix}
              onChange={(event) =>
                setNewBug((current) => ({
                  ...current,
                  suggestedFix: event.target.value,
                }))
              }
              placeholder="Recommendation from SetupDoctor or your own suggested next step."
            />
          </label>
        </div>

        {/* Collapsed "Add more details (optional)" section */}
        <div className="bug-form-optional-section">
          <button
            type="button"
            className="bug-form-details-toggle"
            aria-expanded={isDetailsOpen}
            aria-controls="bug-form-optional-details"
            onClick={() => setIsDetailsOpen((prev) => !prev)}
          >
            <span className="bug-form-details-toggle-label">
              Add more details (optional)
            </span>
            <span className="bug-form-details-chevron" aria-hidden="true">
              {isDetailsOpen ? '▲' : '▼'}
            </span>
          </button>

          {isDetailsOpen && (
            <div
              id="bug-form-optional-details"
              className="bug-form-grid bug-form-optional-grid"
            >
              <label>
                Cause
                <textarea
                  className="bug-textarea-cause"
                  rows={3}
                  value={newBug.cause}
                  onChange={(event) =>
                    setNewBug((current) => ({
                      ...current,
                      cause: event.target.value,
                    }))
                  }
                  placeholder="What caused the problem?"
                />
              </label>

              <label>
                What I Tried
                <textarea
                  className="bug-textarea-what-tried"
                  rows={3}
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
                  rows={3}
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
                    onClick={onCreateCustomCategory}
                  >
                    Add category
                  </button>
                </div>
              )}
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
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Saving...'
              : editingBugId === null
                ? (similarBugs && similarBugs.length > 0 ? 'Save Anyway' : 'Save to Bug Vault')
                : 'Save Changes'}
          </button>
        </div>
      </form>
    </>
  )
}

export default BugForm
export { CREATE_CUSTOM_CATEGORY }
