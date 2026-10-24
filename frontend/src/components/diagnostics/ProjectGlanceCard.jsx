import { useMemo, useState } from 'react'
import { formatStackInPlainWords, getHealthVerdict } from '../../utils/projectGlance.js'

export default function ProjectGlanceCard({
  repository = null,
  health = null,
  framework = null,
  monorepo = false,
  stack = [],
  diagnostics = [],
  deepScanData = null,
  deepScanStatus = 'idle',
  includeNonProd = false,
}) {
  const [isBadgeCopied, setIsBadgeCopied] = useState(false)

  const stackDescription = useMemo(() => {
    return formatStackInPlainWords({
      framework,
      stack,
      language: repository?.language,
      monorepo,
      profile: deepScanData?.profile || deepScanData?.summary?.profile,
      byLanguage: deepScanData?.inventory?.byLanguage || deepScanData?.coverage?.byLanguage || deepScanData?.coverage?.graphLanguages,
    })
  }, [framework, stack, repository?.language, monorepo, deepScanData])

  const verdict = useMemo(() => {
    return getHealthVerdict({
      health,
      diagnostics,
      deepScanData,
      deepScanStatus,
      includeNonProd,
    })
  }, [health, diagnostics, deepScanData, deepScanStatus, includeNonProd])

  const codeFilesCount = useMemo(() => {
    return (
      deepScanData?.coverage?.graphFiles ??
      deepScanData?.graphFiles ??
      deepScanData?.graph?.nodes?.length ??
      deepScanData?.coverage?.analyzedFiles ??
      deepScanData?.inventory?.analyzedFiles ??
      0
    )
  }, [deepScanData])

  const changes = deepScanData?.changes || deepScanData?.summary?.changes || null
  const changesText = useMemo(() => {
    if (!changes) return null
    const { newFindings, fixedFindings } = changes
    if (typeof newFindings !== 'number' && typeof fixedFindings !== 'number') return null
    return `${newFindings ?? 0} new, ${fixedFindings ?? 0} fixed since your last analysis`
  }, [changes])

  const badgeUrl = useMemo(() => {
    if (deepScanData?.badge?.url && /^https?:\/\//i.test(deepScanData.badge.url)) return deepScanData.badge.url
    if (deepScanData?.summary?.badge?.url && /^https?:\/\//i.test(deepScanData.summary.badge.url)) return deepScanData.summary.badge.url
    if (repository?.owner && (repository?.name || repository?.repo)) {
      const o = encodeURIComponent(repository.owner)
      const r = encodeURIComponent(repository.name || repository.repo)
      const base = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000'
      return `${base}/api/badge/${o}/${r}`
    }
    return null
  }, [deepScanData, repository])

  const badgeMarkdown = useMemo(() => {
    if (deepScanData?.badge?.markdown && /^\[!\[SetupDoctor Grade\]\(https?:\/\//i.test(deepScanData.badge.markdown)) {
      return deepScanData.badge.markdown
    }
    if (deepScanData?.summary?.badge?.markdown && /^\[!\[SetupDoctor Grade\]\(https?:\/\//i.test(deepScanData.summary.badge.markdown)) {
      return deepScanData.summary.badge.markdown
    }
    if (badgeUrl && repository?.owner && (repository?.name || repository?.repo)) {
      const o = encodeURIComponent(repository.owner)
      const r = encodeURIComponent(repository.name || repository.repo)
      return `[![SetupDoctor Grade](${badgeUrl})](https://github.com/${o}/${r})`
    }
    return null
  }, [deepScanData, badgeUrl, repository])

  async function handleCopyBadge() {
    if (!badgeMarkdown) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(badgeMarkdown)
        setIsBadgeCopied(true)
        setTimeout(() => setIsBadgeCopied(false), 2000)
        return
      }
    } catch {
      // fallback
    }
    try {
      const textarea = document.createElement('textarea')
      textarea.value = badgeMarkdown
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setIsBadgeCopied(true)
      setTimeout(() => setIsBadgeCopied(false), 2000)
    } catch {
      setIsBadgeCopied(false)
    }
  }

  const projectName = repository?.fullName || repository?.name || 'Project'

  return (
    <section className="project-glance-card" aria-labelledby="project-glance-heading">
      <div className="glance-card-header">
        <div className="glance-title-area">
          <span className="eyebrow">Your project at a glance</span>
          <h2 id="project-glance-heading" className="glance-project-name">
            {projectName}
          </h2>
          <p className="glance-stack-desc">{stackDescription}</p>

          {changesText && (
            <div className="glance-changes-pill" role="status">
              <span className="changes-icon" aria-hidden="true">&#128202;</span>
              <span className="changes-text">{changesText}</span>
            </div>
          )}
        </div>

        <div className={`glance-verdict-badge verdict-${verdict.tone}`}>
          <span className="verdict-icon" aria-hidden="true">
            {verdict.icon}
          </span>
          <div className="verdict-text-wrap">
            <span className="verdict-label">{verdict.label}</span>
            {verdict.gradeText && (
              <span className="verdict-grade-sub">{verdict.gradeText}</span>
            )}
            {verdict.showScore && typeof verdict.score === 'number' && (
              <span className="verdict-score-sub">{verdict.score}/100</span>
            )}
          </div>
        </div>
      </div>

      <div className="glance-card-footer">
        <div className="glance-meta-item">
          <strong className="meta-number">
            {deepScanStatus === 'scanning'
              ? 'Scanning code...'
              : (deepScanStatus === 'error' || (!deepScanData && deepScanStatus === 'idle'))
              ? '—'
              : codeFilesCount.toLocaleString()}
          </strong>
          <span className="meta-label">code files mapped</span>
        </div>

        <div className="glance-verdict-reason">
          <p className="glance-why-sentence">{verdict.summaryLine || verdict.whySentence}</p>
        </div>
      </div>

      {badgeMarkdown && (
        <div className="glance-badge-section">
          <div className="badge-preview-area">
            <span className="badge-label">README badge:</span>
            {badgeUrl && (
              <img
                src={badgeUrl}
                alt="SetupDoctor Grade"
                className="badge-preview-img"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
          </div>
          <div className="badge-copy-area">
            <code className="badge-markdown-code font-mono">{badgeMarkdown}</code>
            <button
              type="button"
              className={`badge-copy-btn ${isBadgeCopied ? 'copied' : ''}`}
              onClick={handleCopyBadge}
              aria-label="Copy badge Markdown to clipboard"
            >
              {isBadgeCopied ? '✓ Copied' : 'Copy snippet'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
