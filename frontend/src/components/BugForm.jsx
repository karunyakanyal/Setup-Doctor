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
  onSubmit,
  onCancel,
  onCreateCustomCategory,
}) {
  return (
    <>
      {similarBugs && similarBugs.length > 0 && (
        <section className="repository-summary similar-bugs" aria-label="Similar problems found">
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

        <div className="bug-form-grid">
          <label>
            Problem
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
            Error
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
                setNewBug((current) => ({
                  ...current,
                  cause: event.target.value,
                }))
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
                setNewBug((current) => ({
                  ...current,
                  suggestedFix: event.target.value,
                }))
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
                onClick={onCreateCustomCategory}
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
            onClick={onCancel}
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
    </>
  )
}

export default BugForm
export { CREATE_CUSTOM_CATEGORY }
