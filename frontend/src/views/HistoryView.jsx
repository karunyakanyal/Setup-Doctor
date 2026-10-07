import { useHistory } from '../hooks/useHistory'

function HistoryView() {
  const { analysisHistory, selectedAnalysis, selectAnalysis } = useHistory()

  return (
    <section aria-labelledby="history-view-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Diagnostic Logs</p>
          <h1 id="history-view-title">History</h1>
        </div>
      </div>

      {selectedAnalysis && (
        <section className="selected-analysis" aria-labelledby="selected-analysis-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Details</p>
              <h2 id="selected-analysis-title">Selected Analysis</h2>
            </div>
          </div>

          <div className="repository-details">
            <div>
              <span>Repository</span>
              <strong>
                {selectedAnalysis.repository?.fullName ||
                  selectedAnalysis.repository?.name ||
                  'Unknown repository'}
              </strong>
            </div>

            <div>
              <span>Default branch</span>
              <strong>
                {selectedAnalysis.repository?.defaultBranch || 'Unknown branch'}
              </strong>
            </div>

            <div>
              <span>Health score</span>
              <strong>{selectedAnalysis.health?.score ?? 'Unknown'}</strong>
            </div>

            <div>
              <span>Health status</span>
              <strong>{selectedAnalysis.health?.status || 'Unknown'}</strong>
            </div>

            <div>
              <span>Total checks</span>
              <strong>{selectedAnalysis.summary?.total ?? 'Unknown'}</strong>
            </div>

            <div>
              <span>Passed checks</span>
              <strong>{selectedAnalysis.summary?.pass ?? 'Unknown'}</strong>
            </div>

            <div>
              <span>Warnings</span>
              <strong>{selectedAnalysis.summary?.warning ?? 'Unknown'}</strong>
            </div>

            <div>
              <span>Errors</span>
              <strong>{selectedAnalysis.summary?.error ?? 'Unknown'}</strong>
            </div>

            <div>
              <span>Analyzed</span>
              <strong>
                {selectedAnalysis.analyzedAt
                  ? new Date(selectedAnalysis.analyzedAt).toLocaleString()
                  : 'Unknown time'}
              </strong>
            </div>
          </div>

          <h3>Diagnostic Checks</h3>

          <div className="diagnostic-list">
            {(Array.isArray(selectedAnalysis.diagnostics)
              ? selectedAnalysis.diagnostics
              : []
            ).map((diagnostic) => (
              <div className="diagnostic-row" key={diagnostic.rule}>
                <span className={`diagnostic-status ${diagnostic.status}`}>
                  <span />
                  {diagnostic.status}
                </span>

                <div className="diagnostic-copy">
                  <span className="diagnostic-message">{diagnostic.message}</span>

                  {(diagnostic.status === 'warning' || diagnostic.status === 'error') && (
                    <div className="diagnostic-details">
                      {typeof diagnostic.why === 'string' && diagnostic.why.trim() && (
                        <p>
                          <strong>Why?</strong> {diagnostic.why}
                        </p>
                      )}

                      {typeof diagnostic.recommendation === 'string' &&
                        diagnostic.recommendation.trim() && (
                          <p>
                            <strong>Recommendation</strong> {diagnostic.recommendation}
                          </p>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysisHistory.length ? (
        analysisHistory.map((analysis) => (
          <div
            className="repository-summary"
            key={`${analysis.repository?.fullName || 'unknown'}-${analysis.analyzedAt}`}
            role="button"
            tabIndex={0}
            onClick={() => selectAnalysis(analysis)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                selectAnalysis(analysis)
              }
            }}
            aria-label={`Select analysis for ${analysis.repository?.fullName || 'repository'}`}
            style={{ cursor: 'pointer' }}
          >
            <div className="repository-summary-heading">
              <div>
                <p className="eyebrow">Analysis</p>
                <h2>{analysis.repository?.fullName || 'Unknown repository'}</h2>
              </div>
            </div>

            <div className="repository-details">
              <div>
                <span>Default branch</span>
                <strong>
                  {analysis.repository?.defaultBranch || 'Unknown branch'}
                </strong>
              </div>

              <div>
                <span>Analyzed</span>
                <strong>
                  {analysis.analyzedAt
                    ? new Date(analysis.analyzedAt).toLocaleString()
                    : 'Unknown time'}
                </strong>
              </div>
            </div>

            <div className="diagnostics-health">
              <strong>{analysis.health?.score ?? 'Unknown'} / 100</strong>
              <span
                className={`health-status health-${analysis.health?.status
                  ?.toLowerCase()
                  .replace(/\s+/g, '-') || 'unknown'}`}
              >
                {analysis.health?.status || 'Unknown'}
              </span>
            </div>

            <div className="diagnostics-summary" aria-label="Analysis summary">
              <span>{analysis.summary?.total ?? 'Unknown'} Checks</span>
              <span>{analysis.summary?.warning ?? 'Unknown'} Warnings</span>
              <span>{analysis.summary?.error ?? 'Unknown'} Errors</span>
            </div>
          </div>
        ))
      ) : (
        <div className="repository-summary bug-vault-empty">
          <h2>No analysis history yet</h2>
          <p className="welcome-copy">
            Analyses performed on the Dashboard will be logged here.
          </p>
        </div>
      )}
    </section>
  )
}

export default HistoryView
