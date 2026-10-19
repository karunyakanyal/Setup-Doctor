import { useState, useMemo } from 'react'
import { getWhatToDoNext } from '../../utils/projectGlance.js'

export default function WhatToDoNextPanel({
  diagnostics = [],
  deepScanData = null,
  deepScanStatus = 'idle',
  includeNonProd = false,
  onInspectFile = null,
}) {
  const [expanded, setExpanded] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  const steps = useMemo(() => {
    return getWhatToDoNext({
      diagnostics,
      deepScanData,
      deepScanStatus,
      includeNonProd,
    })
  }, [diagnostics, deepScanData, deepScanStatus, includeNonProd])

  const displayedSteps = expanded ? steps : steps.slice(0, 3)
  const hasMore = steps.length > 3

  async function handleCopy(id, text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
        return
      }
    } catch {
      // Fallback
    }
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(null)
    }
  }

  const badgeText = useMemo(() => {
    if (steps[0]?.severity === 'Scanning') return 'Scanning...'
    if (steps[0]?.isZeroState) return '0 issues'
    return `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
  }, [steps])

  return (
    <section className="what-to-do-next-panel" aria-labelledby="what-to-do-next-heading">
      <div className="next-panel-header">
        <div>
          <span className="eyebrow">Action plan</span>
          <h2 id="what-to-do-next-heading" className="next-panel-title">
            What to do next
          </h2>
        </div>
        <span className="next-steps-count-badge">
          {badgeText}
        </span>
      </div>

      <div className="next-steps-list">
        {displayedSteps.map((step, idx) => {
          const isCopied = copiedId === step.id

          return (
            <div
              key={step.id || idx}
              className={`next-step-card ${step.isZeroState ? 'is-clean-state' : ''}`}
            >
              <div className="step-card-main">
                <div className="step-number-badge">
                  {step.isZeroState ? (step.severity === 'Scanning' ? '⏳' : '✓') : idx + 1}
                </div>

                <div className="step-content">
                  <div className="step-header-line">
                    <h3 className="step-title">{step.title}</h3>
                    {!step.isZeroState && step.severity && (
                      <span className={`step-severity-badge severity-${step.severity.toLowerCase().replace(/\s+/g, '-')}`}>
                        {step.severity}
                      </span>
                    )}
                  </div>

                  <p className="step-why-sentence">{step.why}</p>
                </div>
              </div>

              {step.action && (
                <div className="step-action-row">
                  {step.action.type === 'file' ? (
                    <button
                      type="button"
                      className="step-action-btn file-action-btn"
                      onClick={() => onInspectFile && onInspectFile(step.action.value)}
                      aria-label={`Open file ${step.action.value}`}
                    >
                      <span className="file-icon" aria-hidden="true">&#128196;</span>
                      <span className="action-text">{step.action.label || `Open ${step.action.value}`}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`step-action-btn command-action-btn ${isCopied ? 'is-copied' : ''}`}
                      onClick={() => handleCopy(step.id, step.action.value)}
                      aria-label={`Copy command to clipboard: ${step.action.value}`}
                    >
                      <span className="command-prompt" aria-hidden="true">$ </span>
                      <code className="command-code font-mono">{step.action.value}</code>
                      <span className="copy-state-tag">
                        {isCopied ? '✓ Copied' : 'Copy'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="next-panel-footer">
          <button
            type="button"
            className="btn-secondary next-toggle-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded
              ? 'Show fewer recommendations'
              : `Show all ${steps.length} recommendations`}
          </button>
        </div>
      )}
    </section>
  )
}
