import { useMemo, useState } from 'react'

export default function FindingsGroupedBySeverity({
  findings = [],
  viewMode = 'simple',
  onSwitchToDetailed = null,
}) {
  const [copiedIndex, setCopiedIndex] = useState(null)

  const sortedFindings = useMemo(() => {
    const list = Array.isArray(findings) ? [...findings] : []
    const severityRank = {
      critical: 0,
      important: 1,
      'nice-to-have': 2,
    }
    return list.sort((a, b) => {
      const rA = severityRank[a?.severity?.toLowerCase()] ?? 3
      const rB = severityRank[b?.severity?.toLowerCase()] ?? 3
      return rA - rB
    })
  }, [findings])

  const { critical, important, niceToHave } = useMemo(() => {
    const crit = []
    const imp = []
    const nice = []

    for (const f of sortedFindings) {
      const s = f?.severity?.toLowerCase()
      if (s === 'critical') crit.push(f)
      else if (s === 'important') imp.push(f)
      else nice.push(f)
    }

    return { critical: crit, important: imp, niceToHave: nice }
  }, [sortedFindings])

  const visibleFindings = useMemo(() => {
    if (viewMode === 'simple') {
      return sortedFindings.slice(0, 3)
    }
    return sortedFindings
  }, [viewMode, sortedFindings])

  async function handleCopyFix(idx, text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setCopiedIndex(idx)
        setTimeout(() => setCopiedIndex(null), 2000)
        return
      }
    } catch {
      // fallback
    }
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const renderFindingCard = (finding, indexKey) => {
    const isCopied = copiedIndex === indexKey
    const moreCount = (typeof finding.count === 'number' && finding.count > 10)
      ? finding.count - (finding.evidence?.length || 0)
      : (typeof finding.count === 'number' && finding.count > 3 && (!finding.evidence || finding.evidence.length < finding.count))
      ? finding.count - (finding.evidence?.length || 0)
      : 0

    return (
      <div
        key={finding.id || indexKey}
        className={`severity-finding-card severity-${finding.severity?.toLowerCase() || 'info'}`}
      >
        <div className="finding-header-row">
          <div className="finding-title-wrap">
            <h4 className="finding-name">{finding.name || finding.id}</h4>
            <span className="finding-dimension-tag">{finding.dimension}</span>
          </div>
          <span className={`finding-severity-badge severity-${finding.severity?.toLowerCase()}`}>
            {finding.severity}
          </span>
        </div>

        {/* Why */}
        <div className="finding-body-section finding-why-wrap">
          <strong className="finding-label">Why:</strong>
          <span className="finding-why-text">{finding.why}</span>
        </div>

        {/* Fix */}
        <div className="finding-body-section finding-fix-wrap">
          <strong className="finding-label">Fix:</strong>
          <code className="finding-fix-code font-mono">{finding.fix}</code>
          {finding.fix && (
            <button
              type="button"
              className={`copy-fix-btn ${isCopied ? 'copied' : ''}`}
              onClick={() => handleCopyFix(indexKey, finding.fix)}
              aria-label="Copy fix to clipboard"
            >
              {isCopied ? '✓ Copied' : 'Copy fix'}
            </button>
          )}
        </div>

        {/* Evidence lines */}
        {Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
          <div className="finding-evidence-section">
            <strong className="finding-label">Evidence:</strong>
            <div className="finding-evidence-list">
              {finding.evidence.map((ev, evIdx) => (
                <div key={`${ev.file}-${ev.line}-${evIdx}`} className="evidence-line-row font-mono">
                  <span className="evidence-file">{ev.file}{ev.line ? `:${ev.line}` : ''}</span>
                  {ev.snippet && (
                    <span className="evidence-snippet">&quot;{ev.snippet}&quot;</span>
                  )}
                </div>
              ))}
              {moreCount > 0 && (
                <span className="evidence-more-badge">+{moreCount} more</span>
              )}
            </div>
          </div>
        )}

        {/* Root-cause children if present */}
        {Array.isArray(finding.children) && finding.children.length > 0 && (
          <div className="finding-children-section">
            <strong className="finding-label">Related impacts:</strong>
            <div className="finding-children-list">
              {finding.children.map((child, chIdx) => (
                <div key={child.id || chIdx} className="finding-child-row">
                  <span className="child-name">{child.name || child.id}</span>
                  <span className="child-why">{child.why}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Docs Link */}
        {finding.docsUrl && (
          <div className="finding-footer-row">
            <a
              href={finding.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="finding-docs-link"
            >
              Official Documentation &rarr;
            </a>
          </div>
        )}
      </div>
    )
  }

  // If no findings at all
  if (sortedFindings.length === 0) {
    return (
      <section className="severity-findings-section" aria-labelledby="severity-findings-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Rule findings</span>
            <h2 id="severity-findings-heading">Rule Engine Findings</h2>
          </div>
        </div>
        <div className="findings-zero-state">
          <span className="zero-icon" aria-hidden="true">✓</span>
          <div className="zero-content">
            <strong>No committed secrets found. Good.</strong>
            <p className="zero-desc">
              All security, reliability, maintainability, and hygiene checks passed cleanly.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="severity-findings-section" aria-labelledby="severity-findings-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Rule findings</span>
          <h2 id="severity-findings-heading">
            Findings by Severity ({sortedFindings.length})
          </h2>
        </div>
        {viewMode === 'simple' && sortedFindings.length > 3 && (
          <button
            type="button"
            className="btn-secondary switch-to-detailed-btn"
            onClick={onSwitchToDetailed}
          >
            Show all {sortedFindings.length} findings in Detailed mode
          </button>
        )}
      </div>

      {viewMode === 'simple' ? (
        <div className="simple-findings-list">
          <div className="simple-mode-intro">
            Showing top {visibleFindings.length} findings by severity:
          </div>
          <div className="findings-cards-wrap">
            {visibleFindings.map((finding, idx) => renderFindingCard(finding, `simple-${idx}`))}
          </div>
        </div>
      ) : (
        <div className="detailed-findings-groups">
          {/* Critical Group */}
          <div className="severity-group severity-critical-group">
            <div className="severity-group-header">
              <h3 className="severity-group-title">Critical Findings</h3>
              <span className="severity-group-count">
                {critical.length} {critical.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            {critical.length > 0 ? (
              <div className="findings-cards-wrap">
                {critical.map((f, idx) => renderFindingCard(f, `crit-${idx}`))}
              </div>
            ) : (
              <p className="severity-zero-state-line">
                No committed secrets found. Good. No critical runtime or security issues.
              </p>
            )}
          </div>

          {/* Important Group */}
          <div className="severity-group severity-important-group">
            <div className="severity-group-header">
              <h3 className="severity-group-title">Important Findings</h3>
              <span className="severity-group-count">
                {important.length} {important.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            {important.length > 0 ? (
              <div className="findings-cards-wrap">
                {important.map((f, idx) => renderFindingCard(f, `imp-${idx}`))}
              </div>
            ) : (
              <p className="severity-zero-state-line">
                No important configuration or import issues detected. Clean.
              </p>
            )}
          </div>

          {/* Nice to have Group */}
          <div className="severity-group severity-nicetohave-group">
            <div className="severity-group-header">
              <h3 className="severity-group-title">Nice-to-Have Findings</h3>
              <span className="severity-group-count">
                {niceToHave.length} {niceToHave.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            {niceToHave.length > 0 ? (
              <div className="findings-cards-wrap">
                {niceToHave.map((f, idx) => renderFindingCard(f, `nice-${idx}`))}
              </div>
            ) : (
              <p className="severity-zero-state-line">
                No dependency or repository hygiene recommendations. Good.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
