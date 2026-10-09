import {
  getGrade,
  getHealthLabel,
  getCategoryScore,
  CATEGORIES,
  CATEGORY_LABELS,
} from '../../utils/diagnosisFormatters.js'

function DiagnosticsHealthSummary({
  health,
  framework = null,
  monorepo = false,
  diagnostics = [],
}) {
  const score = typeof health?.score === 'number' ? Math.max(0, Math.min(100, Math.round(health.score))) : null
  const grade = getGrade(health)
  const label = getHealthLabel(health, grade)
  const categoryScores = health?.categoryScores || {}

  return (
    <div className="diagnostics-health-summary-panel">
      {monorepo && (
        <div className="monorepo-banner" role="status">
          <span className="monorepo-badge">Monorepo</span>
          <span>Monorepo detected; only the root package.json and repository tree were analyzed.</span>
        </div>
      )}

      <div className="diagnostics-health-top">
        <div className="diagnostics-health-score-card">
          <div className="health-score-display">
            <span className="health-score-number">
              {score !== null ? score : 'N/A'}
            </span>
            <span className="health-score-max">/ 100</span>
          </div>

          <div className="health-grade-container">
            <span className={`grade-badge grade-badge-${grade}`}>{grade}</span>
            <span className={`health-status health-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {label}
            </span>
          </div>

          {framework && (
            <div className="framework-tag-wrap">
              <span className="framework-tag">
                Framework: <strong>{framework}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="category-scores-section" aria-label="Category performance scores">
          <h3 className="category-scores-title">Category Breakdown</h3>
          <div className="category-bars-grid">
            {CATEGORIES.map((catKey) => {
              const catScore = getCategoryScore(catKey, categoryScores, diagnostics)
              const catLabel = CATEGORY_LABELS[catKey] || catKey

              return (
                <div className="category-bar-item" key={catKey}>
                  <div className="category-bar-header">
                    <span className="category-bar-name">{catLabel}</span>
                    <span className="category-bar-value">
                      {catScore !== null ? `${catScore}%` : 'N/A'}
                    </span>
                  </div>

                  <div
                    className="category-progress-track"
                    role="progressbar"
                    aria-valuenow={catScore !== null ? catScore : undefined}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-label={`${catLabel} score: ${catScore !== null ? `${catScore}%` : 'Not applicable'}`}
                  >
                    {catScore !== null ? (
                      <div
                        className={`category-progress-fill ${
                          catScore >= 90
                            ? 'fill-healthy'
                            : catScore >= 70
                            ? 'fill-good'
                            : catScore >= 50
                            ? 'fill-warning'
                            : 'fill-risk'
                        }`}
                        style={{ width: `${catScore}%` }}
                      />
                    ) : (
                      <div className="category-progress-na" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DiagnosticsHealthSummary
