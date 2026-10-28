import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function ChangeImpactView({ initialImpactData = null } = {}) {
  const [searchParams] = useSearchParams()
  const initialRepo = searchParams.get('repo') || ''
  const initialPr = searchParams.get('pr') || ''

  const [mode, setMode] = useState('pr') // 'pr' | 'compare'
  const [repoInput, setRepoInput] = useState(initialRepo)
  const [prInput, setPrInput] = useState(initialPr)
  const [baseInput, setBaseInput] = useState('main')
  const [headInput, setHeadInput] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [impactData, setImpactData] = useState(initialImpactData)
  const [copied, setCopied] = useState(false)
  const [openFolders, setOpenFolders] = useState({})

  const handleAnalyze = useCallback(async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    setError(null)

    const trimmedRepo = repoInput.trim()
    if (!trimmedRepo) {
      setError('Please enter a repository URL or owner/repo.')
      return
    }

    let payload = { repositoryUrl: trimmedRepo }
    if (mode === 'pr') {
      const trimmedPr = prInput.trim()
      if (!trimmedPr) {
        setError('Please enter a pull request number or URL.')
        return
      }
      if (/^\d+$/.test(trimmedPr)) {
        payload.pullNumber = parseInt(trimmedPr, 10)
      } else {
        payload.repositoryUrl = trimmedPr // Can be full PR URL
      }
    } else {
      const trimmedBase = baseInput.trim() || 'main'
      const trimmedHead = headInput.trim()
      if (!trimmedHead) {
        setError('Please enter a head branch or commit SHA to compare.')
        return
      }
      payload.base = trimmedBase
      payload.head = trimmedHead
    }

    setLoading(true)
    setImpactData(null)

    try {
      const res = await fetch('/api/repository/change-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to analyze change impact.')
      }

      setImpactData(data)
      // Open the largest affected folder by default
      if (data.blastRadius?.byFolder?.[0]?.folder) {
        setOpenFolders({ [data.blastRadius.byFolder[0].folder]: true })
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to SetupDoctor backend.')
    } finally {
      setLoading(false)
    }
  }, [baseInput, headInput, mode, prInput, repoInput])

  // If initial query params provided, run analysis on mount
  useEffect(() => {
    if (!initialRepo || !initialPr) return
    const timer = setTimeout(() => {
      handleAnalyze()
    }, 0)
    return () => clearTimeout(timer)
  }, [handleAnalyze, initialPr, initialRepo])

  const handleCopyComment = async () => {
    if (!impactData?.markdownSummary) return
    try {
      await navigator.clipboard.writeText(impactData.markdownSummary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea')
      textarea.value = impactData.markdownSummary
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const toggleFolder = (folder) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }))
  }

  const riskBadgeClass = useMemo(() => {
    const level = impactData?.risk?.level?.toLowerCase()
    if (level === 'high') return 'risk-badge-high'
    if (level === 'medium') return 'risk-badge-medium'
    return 'risk-badge-low'
  }, [impactData?.risk?.level])

  const riskIcon = useMemo(() => {
    const level = impactData?.risk?.level?.toLowerCase()
    if (level === 'high') return '🔴'
    if (level === 'medium') return '🟡'
    return '🟢'
  }, [impactData?.risk?.level])

  return (
    <div className="change-impact-page" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <header className="change-impact-header">
        <div className="header-titles">
          <span className="eyebrow">Pull Request & Branch Insights</span>
          <h1 className="view-title">Change Impact Analysis</h1>
          <p className="view-subtitle">
            Predict blast radius, broken imports, and required tests before merging.
          </p>
        </div>
      </header>

      {/* Input Form Card */}
      <section className="change-impact-form-card" aria-label="Analyze pull request form">
        <form onSubmit={handleAnalyze} className="impact-query-form">
          <div className="form-mode-tabs" role="tablist" aria-label="Comparison mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pr'}
              className={`mode-tab-btn ${mode === 'pr' ? 'active' : ''}`}
              onClick={() => setMode('pr')}
            >
              Pull Request
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'compare'}
              className={`mode-tab-btn ${mode === 'compare' ? 'active' : ''}`}
              onClick={() => setMode('compare')}
            >
              Branch Comparison
            </button>
          </div>

          <div className="form-fields-grid">
            <div className="form-field">
              <label htmlFor="repo-input" className="form-label">
                Repository (owner/repo or URL)
              </label>
              <input
                id="repo-input"
                type="text"
                className="input-text font-mono"
                placeholder="e.g. Amanyadav0556/Skinveda.ai"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                required
              />
            </div>

            {mode === 'pr' ? (
              <div className="form-field">
                <label htmlFor="pr-input" className="form-label">
                  Pull Request (Number or PR URL)
                </label>
                <input
                  id="pr-input"
                  type="text"
                  className="input-text font-mono"
                  placeholder="e.g. 15 or https://github.com/.../pull/15"
                  value={prInput}
                  onChange={(e) => setPrInput(e.target.value)}
                  required
                />
              </div>
            ) : (
              <>
                <div className="form-field">
                  <label htmlFor="base-input" className="form-label">
                    Base Branch
                  </label>
                  <input
                    id="base-input"
                    type="text"
                    className="input-text font-mono"
                    placeholder="main"
                    value={baseInput}
                    onChange={(e) => setBaseInput(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="head-input" className="form-label">
                    Head Branch or Commit
                  </label>
                  <input
                    id="head-input"
                    type="text"
                    className="input-text font-mono"
                    placeholder="e.g. feature-branch"
                    value={headInput}
                    onChange={(e) => setHeadInput(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div className="form-actions-row">
            <button
              type="submit"
              className="btn-primary analyze-submit-btn"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-mini" aria-hidden="true" />
                  <span>Analyzing change impact...</span>
                </>
              ) : (
                'Analyze Change Impact'
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="impact-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Initial Empty State */}
      {!loading && !impactData && !error && (
        <div className="impact-empty-state" role="status">
          <div className="empty-icon-wrap" aria-hidden="true">🔍</div>
          <h3>Ready to analyze change impact</h3>
          <p>
            Enter a pull request URL (e.g. <span className="font-mono">https://github.com/owner/repo/pull/15</span>) or branch comparison above to predict blast radius and detect breaking changes.
          </p>
        </div>
      )}

      {/* Results View */}
      {impactData && (
        <div className="impact-results-container" aria-label="Change impact results">
          {/* Top Verdict & PR Comment Banner */}
          <section className="impact-verdict-card">
            <div className="verdict-card-top">
              <div className="verdict-title-group">
                <span className="eyebrow">
                  {impactData.pullNumber ? `Pull Request #${impactData.pullNumber}` : `Comparison ${impactData.base}...${impactData.head?.slice(0, 7)}`}
                </span>
                <h2 className="pr-title">
                  {impactData.prTitle || `${impactData.repository?.owner}/${impactData.repository?.repo}`}
                </h2>
              </div>

              <button
                type="button"
                className={`btn-secondary copy-pr-comment-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopyComment}
                aria-label="Copy markdown summary as PR comment"
              >
                {copied ? '✓ Comment copied!' : '📋 Copy PR comment'}
              </button>
            </div>

            <div className="verdict-risk-row">
              <div className={`change-risk-pill ${riskBadgeClass}`}>
                <span className="risk-pill-icon">{riskIcon}</span>
                <span className="risk-pill-label">{impactData.risk?.level} risk</span>
              </div>
              <p className="risk-rule-reason font-medium">
                {impactData.risk?.reason}
              </p>
            </div>
          </section>

          {/* Three Plain Answers */}
          <section className="impact-three-answers-grid" aria-label="Three plain answers">
            {/* 1. What changes */}
            <div className="plain-answer-card card-what-changes">
              <div className="card-top-header">
                <span className="card-num">1</span>
                <h3 className="card-heading">What changes</h3>
              </div>
              <p className="answer-summary-stat">
                <strong>{impactData.changedFiles?.total}</strong> changed files (
                {impactData.changedFiles?.mappedCount} mapped to code graph
                {impactData.changedFiles?.newOrUnmappedCount > 0 && `, ${impactData.changedFiles.newOrUnmappedCount} new/unmapped`}
                )
              </p>

              <div className="changed-files-scroll-list">
                {impactData.changedFiles?.mapped?.map((f) => (
                  <div key={f.path} className="changed-file-row">
                    <span className={`status-pill status-${f.status}`}>{f.status}</span>
                    <span className="file-path-text font-mono" title={f.path}>
                      {f.path}
                    </span>
                  </div>
                ))}
                {impactData.changedFiles?.newOrUnmapped?.map((f) => (
                  <div key={f.path} className="changed-file-row unmapped">
                    <span className={`status-pill status-${f.status}`}>{f.status}</span>
                    <span className="file-path-text font-mono" title={f.path}>
                      {f.path}
                    </span>
                    <span className="unmapped-tag">new/unmapped</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. What else could break */}
            <div className="plain-answer-card card-what-breaks">
              <div className="card-top-header">
                <span className="card-num">2</span>
                <h3 className="card-heading">What else could break</h3>
              </div>
              <p className="answer-summary-stat">
                <strong>{impactData.blastRadius?.affectedCount}</strong> of {impactData.blastRadius?.totalCodeFiles} files ({impactData.blastRadius?.percentOfRepo}%) in blast radius
              </p>

              {impactData.willBreak?.count > 0 ? (
                <div className="will-break-alert-box" role="alert">
                  <span className="alert-title">⚠️ {impactData.willBreak.count} will-break finding(s)</span>
                  <ul className="will-break-alert-list">
                    {impactData.willBreak.findings.map((finding, idx) => (
                      <li key={idx} className="will-break-alert-item">
                        <strong>{finding.file}</strong> was {finding.status}, but{' '}
                        <strong>{finding.importer}{finding.line ? `:${finding.line}` : ''}</strong> still imports it:
                        <code className="broken-code-snippet font-mono">{finding.snippet}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="answer-zero-state">
                  No broken imports found. Removed and renamed files are safely updated or unreferenced.
                </p>
              )}

              {impactData.unchangedButAffected?.count === 0 ? (
                <p className="answer-zero-state highlight-zero">
                  No unchanged file depends on this PR. Low risk.
                </p>
              ) : (
                <p className="answer-sub-stat">
                  <strong>{impactData.unchangedButAffected?.count}</strong> unchanged files depend on these changes.
                </p>
              )}
            </div>

            {/* 3. What to test */}
            <div className="plain-answer-card card-what-to-test">
              <div className="card-top-header">
                <span className="card-num">3</span>
                <h3 className="card-heading">What to test</h3>
              </div>

              {impactData.tests?.count > 0 ? (
                <div className="tests-reached-group">
                  <p className="answer-summary-stat">
                    🧪 <strong>{impactData.tests.count}</strong> test files reach these changes
                  </p>
                  <ul className="impact-test-list">
                    {impactData.tests.files.slice(0, 6).map((t) => (
                      <li key={t} className="impact-test-item font-mono" title={t}>
                        {t}
                      </li>
                    ))}
                    {impactData.tests.files.length > 6 && (
                      <li className="impact-test-more font-mono">
                        +{impactData.tests.files.length - 6} more test files
                      </li>
                    )}
                  </ul>
                </div>
              ) : (
                <div className="no-tests-alert">
                  <p className="answer-no-tests-msg">
                    ⚠️ No tests touch these files; test affected entry points and routes manually.
                  </p>
                </div>
              )}

              {(impactData.entryPointsReached?.length > 0 || impactData.routesReached?.length > 0) && (
                <div className="entry-points-impacted-group">
                  <span className="sub-header-label">Entry Points & Routes Affected</span>
                  <ul className="entry-points-list">
                    {impactData.entryPointsReached?.map((ep) => (
                      <li key={ep} className="entry-point-item font-mono">
                        <span className="entry-badge">ENTRY</span> {ep}
                      </li>
                    ))}
                    {impactData.routesReached?.map((r, i) => (
                      <li key={i} className="route-item font-mono">
                        <span className="route-badge">ROUTE</span> {r.method || 'GET'} {r.path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Folder Blast Radius Rows */}
          <section className="impact-folders-section" aria-labelledby="folder-blast-heading">
            <div className="section-header">
              <div>
                <span className="eyebrow">Blast Radius Breakdown</span>
                <h3 id="folder-blast-heading" className="section-title">
                  Folder blast radius ({impactData.blastRadius?.byFolder?.length || 0} folders)
                </h3>
              </div>
              <span className="legend-strip font-mono">
                <span className="legend-dot bar-direct" /> direct
                <span className="legend-dot bar-indirect" /> indirect
                <span className="legend-dot bar-unaffected" /> unaffected
              </span>
            </div>

            {(!impactData.blastRadius?.byFolder || impactData.blastRadius.byFolder.length === 0) ? (
              <div className="zero-state-box">
                <p>0 files affected outside of the PR changes.</p>
              </div>
            ) : (
              <div className="folder-blast-rows-list">
                {impactData.blastRadius.byFolder.map((item, idx) => {
                  const isOpen = Boolean(openFolders[item.folder] || (idx === 0 && openFolders[item.folder] === undefined))
                  const directPct = item.total > 0 ? (item.direct / item.total) * 100 : 0
                  const indirectPct = item.total > 0 ? (item.indirect / item.total) * 100 : 0
                  const unaffectedPct = item.total > 0 ? (item.unaffected / item.total) * 100 : 0

                  return (
                    <div key={item.folder} className={`folder-blast-row ${isOpen ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="folder-blast-summary-btn"
                        onClick={() => toggleFolder(item.folder)}
                        aria-expanded={isOpen}
                        aria-label={`${item.folder}: ${item.affected} of ${item.total} files affected`}
                      >
                        <span className="folder-blast-toggle-icon">{isOpen ? '▼' : '▶'}</span>
                        <span className="folder-name font-mono">{item.folder}</span>

                        <div className="folder-bar-track" aria-hidden="true">
                          {directPct > 0 && (
                            <div
                              className="folder-bar-segment bar-direct"
                              style={{ width: `${directPct}%` }}
                              title={`${item.direct} direct`}
                            />
                          )}
                          {indirectPct > 0 && (
                            <div
                              className="folder-bar-segment bar-indirect"
                              style={{ width: `${indirectPct}%` }}
                              title={`${item.indirect} indirect`}
                            />
                          )}
                          {unaffectedPct > 0 && (
                            <div
                              className="folder-bar-segment bar-unaffected"
                              style={{ width: `${unaffectedPct}%` }}
                              title={`${item.unaffected} unaffected`}
                            />
                          )}
                        </div>

                        <span className="folder-count-text">
                          {item.affected} of {item.total} files affected
                        </span>
                      </button>

                      {isOpen && (
                        <div className="folder-files-expanded-list">
                          <p className="folder-expanded-summary">
                            {item.direct} direct dependent{item.direct === 1 ? '' : 's'}, {item.indirect} indirect dependent{item.indirect === 1 ? '' : 's'}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Markdown PR Comment Card */}
          <section className="impact-markdown-section" aria-labelledby="pr-comment-heading">
            <div className="section-header">
              <div>
                <span className="eyebrow">GitHub Pull Request Comment</span>
                <h3 id="pr-comment-heading" className="section-title">
                  Ready-to-paste PR comment summary
                </h3>
              </div>
              <button
                type="button"
                className={`btn-secondary copy-pr-comment-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopyComment}
              >
                {copied ? '✓ Copied!' : '📋 Copy comment markdown'}
              </button>
            </div>

            <div className="markdown-preview-box font-mono">
              <pre className="markdown-pre">{impactData.markdownSummary}</pre>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
