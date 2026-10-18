import { useMemo } from 'react'
import { formatStackInPlainWords, getHealthVerdict } from '../../utils/projectGlance.js'

export default function ProjectGlanceCard({
  repository = null,
  health = null,
  framework = null,
  monorepo = false,
  stack = [],
  diagnostics = [],
  deepScanData = null,
}) {
  const stackDescription = useMemo(() => {
    return formatStackInPlainWords({
      framework,
      stack,
      language: repository?.language,
      monorepo,
    })
  }, [framework, stack, repository?.language, monorepo])

  const verdict = useMemo(() => {
    return getHealthVerdict({
      health,
      diagnostics,
      deepScanData,
    })
  }, [health, diagnostics, deepScanData])

  const codeFilesCount = useMemo(() => {
    return (
      deepScanData?.coverage?.graphFiles ??
      deepScanData?.graph?.nodes?.length ??
      deepScanData?.inventory?.analyzedFiles ??
      deepScanData?.coverage?.analyzedFiles ??
      0
    )
  }, [deepScanData])

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
        </div>

        <div className={`glance-verdict-badge verdict-${verdict.tone}`}>
          <span className="verdict-icon" aria-hidden="true">
            {verdict.icon}
          </span>
          <div className="verdict-text-wrap">
            <span className="verdict-label">{verdict.label}</span>
            <span className="verdict-score-sub">{verdict.score}/100</span>
          </div>
        </div>
      </div>

      <div className="glance-card-footer">
        <div className="glance-meta-item">
          <strong className="meta-number">{codeFilesCount.toLocaleString()}</strong>
          <span className="meta-label">code files mapped</span>
        </div>

        <div className="glance-verdict-reason">
          <p className="glance-why-sentence">{verdict.whySentence}</p>
        </div>
      </div>
    </section>
  )
}
