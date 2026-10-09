import { useState } from 'react'
import { calculateScoreBreakdown } from '../../utils/diagnosisFormatters.js'

function ScoreBreakdown({ diagnostics = [], reportedScore = null }) {
  const [isOpen, setIsOpen] = useState(false)
  const breakdown = calculateScoreBreakdown(diagnostics, reportedScore)

  if (!breakdown.available) {
    return (
      <div className="score-breakdown-card unavailable">
        <p className="score-breakdown-note">
          Score breakdown is unavailable for this repository: {breakdown.reason}.
        </p>
      </div>
    )
  }

  const { deductions, totalScoredChecks, totalDeductions, effectiveScore } = breakdown

  return (
    <div className="score-breakdown-card">
      <button
        type="button"
        className="score-breakdown-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="score-breakdown-details"
      >
        <div className="score-breakdown-toggle-heading">
          <span className="score-breakdown-icon" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
          <span className="score-breakdown-title">Score Breakdown & Deductions</span>
          <span className="score-breakdown-badge">
            {deductions.length} {deductions.length === 1 ? 'deduction' : 'deductions'}
          </span>
        </div>

        <span className="score-breakdown-summary-text">
          {deductions.length === 0
            ? '100% (No deductions applied)'
            : `-${totalDeductions} pts total (${deductions.length} checks)`}
        </span>
      </button>

      {isOpen && (
        <div id="score-breakdown-details" className="score-breakdown-details">
          <p className="score-breakdown-intro">
            Health score is derived from <strong>{totalScoredChecks}</strong> scored checks (starting at 100).
            Each failing check deducts <strong>{(100 / totalScoredChecks).toFixed(1)} pts</strong>, and each warning
            deducts <strong>{(50 / totalScoredChecks).toFixed(1)} pts</strong>.
          </p>

          {deductions.length === 0 ? (
            <div className="score-breakdown-empty">
              <span className="clean-score-icon">&#10003;</span>
              <span>All scored checks passed with zero deductions. Perfect score!</span>
            </div>
          ) : (
            <ul className="deductions-list">
              {deductions.map((d) => (
                <li key={d.ruleId} className={`deduction-row deduction-${d.status}`}>
                  <div className="deduction-info">
                    <span className={`deduction-status-tag ${d.status}`}>
                      {d.status === 'error' ? 'Error' : 'Warning'}
                    </span>
                    <strong className="deduction-rule-title">{d.title}</strong>
                    <span className="deduction-rule-id">({d.ruleId})</span>
                  </div>
                  <span className="deduction-amount">
                    -{d.deduction} pts
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="score-reconciliation">
            <span>Base score (100) - Total deductions ({totalDeductions} pts) =</span>
            <strong>{effectiveScore} / 100 final score</strong>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScoreBreakdown
