export default function DimensionRatingTiles({ dimensions = null }) {
  if (!dimensions) return null

  const items = [
    {
      key: 'security',
      title: 'Security',
      icon: '🔒',
      data: dimensions.security || { grade: 'A', score: 100, reason: 'No security issues found' },
    },
    {
      key: 'reliability',
      title: 'Reliability',
      icon: '⚙️',
      data: dimensions.reliability || { grade: 'A', score: 100, reason: 'No reliability issues found' },
    },
    {
      key: 'maintainability',
      title: 'Maintainability',
      icon: '🧹',
      data: dimensions.maintainability || { grade: 'A', score: 100, reason: 'Clean structure and dependencies' },
    },
    {
      key: 'hygiene',
      title: 'Hygiene',
      icon: '🛡️',
      data: dimensions.hygiene || { grade: 'A', score: 100, reason: 'Good repository hygiene' },
    },
  ]

  return (
    <section className="dimension-ratings-section" aria-labelledby="dimension-ratings-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Health dimensions</span>
          <h2 id="dimension-ratings-heading" className="dimension-section-title">
            Dimension Ratings
          </h2>
        </div>
        {dimensions.overallGrade && (
          <div className="overall-dimension-summary">
            <span className="overall-label">Overall:</span>
            <span className={`overall-grade-tag grade-${dimensions.overallGrade?.toLowerCase()}`}>
              Grade {dimensions.overallGrade}
            </span>
            {dimensions.capReason && (
              <span className="overall-cap-tag">(capped: {dimensions.capReason})</span>
            )}
          </div>
        )}
      </div>

      <div className="dimension-tiles-grid" role="list" aria-label="Dimension ratings">
        {items.map(({ key, title, icon, data }) => {
          const grade = data.grade || 'A'
          const score = typeof data.score === 'number' ? data.score : 10
          const reason = data.reason || 'No issues found'

          return (
            <div
              key={key}
              role="listitem"
              className={`dimension-tile dimension-${key} grade-${grade.toLowerCase()}`}
            >
              <div className="tile-top-row">
                <span className="dimension-tile-title">
                  <span className="dimension-icon" aria-hidden="true">{icon}</span>
                  {title}
                </span>
                <span className={`dimension-grade-badge grade-badge-${grade.toLowerCase()}`}>
                  {grade}
                </span>
              </div>

              <div className="tile-score-row">
                <span className="dimension-score-text">{score}/100</span>
              </div>

              <p className="dimension-reason-text">{reason}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
