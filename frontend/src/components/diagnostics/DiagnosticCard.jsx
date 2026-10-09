import { useState } from 'react'
import { getCopyableFix, normalizeStatus } from '../../utils/diagnosisFormatters.js'
import { isDiagnosticSavedInVault } from '../../utils/bugVaultData.js'

function DiagnosticCard({
  diagnostic,
  repositoryName = null,
  bugs = [],
  onSaveToVault,
  onViewInVault,
}) {
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'error'
  const [isFixExpanded, setIsFixExpanded] = useState(true)

  const status = normalizeStatus(diagnostic.status)
  const isFailedOrWarning = status === 'error' || status === 'warning'

  const copyableFix = getCopyableFix(diagnostic.fix)
  const fixDescription = typeof diagnostic.fix?.description === 'string' ? diagnostic.fix.description.trim() : null

  const isSavedInVault = isDiagnosticSavedInVault(bugs, repositoryName, diagnostic)

  async function handleCopy(text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 2000)
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      // Fallback selection via temporary textarea
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 2000)
      } catch {
        setCopyState('error')
        setTimeout(() => setCopyState('idle'), 3000)
      }
    }
  }

  const title = diagnostic.title || diagnostic.rule || 'Diagnostic Check'

  return (
    <article className={`diagnostic-card status-${status}`} aria-labelledby={`diag-${diagnostic.ruleId || diagnostic.rule}`}>
      <div className="diagnostic-card-header">
        <div className="diagnostic-status-wrap">
          <span className={`diagnostic-status-pill ${status}`}>
            <span className={`status-dot dot-${status}`} aria-hidden="true" />
            <span className="status-label">{status}</span>
          </span>

          <h4 id={`diag-${diagnostic.ruleId || diagnostic.rule}`} className="diagnostic-title">
            {title}
          </h4>
        </div>

        <div className="diagnostic-header-tags">
          {diagnostic.category && (
            <span className="diagnostic-category-tag">{diagnostic.category}</span>
          )}

          {diagnostic.priority && isFailedOrWarning && (
            <span className={`diagnostic-priority-tag priority-${diagnostic.priority.toLowerCase()}`}>
              Priority: {diagnostic.priority}
            </span>
          )}
        </div>
      </div>

      <div className="diagnostic-card-body">
        <p className="diagnostic-message-text">{diagnostic.message}</p>

        {fixDescription && (
          <p className="diagnostic-fix-description">
            <strong>Suggested fix:</strong> {fixDescription}
          </p>
        )}

        {copyableFix && (
          <div className="diagnostic-fix-block">
            <div className="fix-block-header">
              <span className="fix-type-badge">
                {copyableFix.type === 'command' ? 'Terminal Command' : 'Configuration Snippet'}
              </span>

              <button
                type="button"
                className="fix-toggle-button"
                onClick={() => setIsFixExpanded((prev) => !prev)}
                aria-expanded={isFixExpanded}
              >
                {isFixExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {isFixExpanded && (
              <div className="fix-content-wrapper">
                <pre
                  className={`fix-code-pre ${copyableFix.type === 'command' ? 'is-command' : 'is-snippet'}`}
                  tabIndex={0}
                  aria-label={copyableFix.type === 'command' ? 'Terminal command to run' : 'Configuration code snippet to add'}
                >
                  {copyableFix.type === 'command' && <span className="shell-prompt" aria-hidden="true">$ </span>}
                  <code>{copyableFix.content}</code>
                </pre>

                <div className="fix-actions">
                  <button
                    type="button"
                    className={`btn-secondary fix-copy-btn ${copyState === 'copied' ? 'is-copied' : ''}`}
                    onClick={() => handleCopy(copyableFix.content)}
                    aria-label={`Copy ${copyableFix.type === 'command' ? 'command' : 'snippet'} to clipboard`}
                  >
                    {copyState === 'copied'
                      ? '✓ Copied'
                      : copyState === 'error'
                      ? 'Select text manually'
                      : copyableFix.type === 'command'
                      ? 'Copy Command'
                      : 'Copy Snippet'}
                  </button>

                  <span className="copy-feedback-sr" aria-live="polite">
                    {copyState === 'copied' && 'Copied to clipboard'}
                    {copyState === 'error' && 'Clipboard copy failed. Please select text manually.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {isFailedOrWarning && (
          <div className="diagnostic-explanation-block">
            {typeof diagnostic.why === 'string' && diagnostic.why.trim() && (
              <div className="explanation-section">
                <strong>Why?</strong>
                <p>{diagnostic.why}</p>
              </div>
            )}

            {typeof diagnostic.recommendation === 'string' && diagnostic.recommendation.trim() && (
              <div className="explanation-section">
                <strong>Recommendation:</strong>
                <p>{diagnostic.recommendation}</p>
              </div>
            )}
          </div>
        )}

        {isFailedOrWarning && (
          <div className="diagnostic-card-footer">
            <div className="diagnostic-footer-actions">
              {isSavedInVault ? (
                <button
                  type="button"
                  className="diagnostic-save-button is-saved"
                  onClick={() => onViewInVault && onViewInVault(diagnostic)}
                  title="View this issue in Bug Vault"
                >
                  <span aria-hidden="true">✓ </span>In Bug Vault
                </button>
              ) : (
                <button
                  type="button"
                  className="diagnostic-save-button"
                  onClick={() => onSaveToVault && onSaveToVault(diagnostic)}
                >
                  Save to Bug Vault
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

export default DiagnosticCard
