function RecentAnalyses({ history, onSelectAnalysis }) {
  const analyses = Array.isArray(history) ? history : []

  return (
    <section className="recent-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>Recent Analyses</h2>
        </div>
        <a href="#" className="view-all">View all <span>&#8594;</span></a>
      </div>
      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr><th>Repository</th><th>Status</th><th>Analyzed</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {analyses.length ? analyses.map((analysis) => {
              const issueCount = (analysis.summary?.warning || 0) + (analysis.summary?.error || 0)
              const status = analysis.health?.status || 'Unknown'
              const repositoryName = analysis.repository?.name || analysis.repository?.fullName || 'Unknown repository'
              const repositoryBranch = analysis.repository?.defaultBranch || 'Unknown branch'
              const initials = repositoryName.slice(0, 2).toUpperCase()
              const analyzedAt = analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : 'Unknown time'

              return (
              <tr key={`${analysis.repository?.fullName || repositoryName}-${analysis.analyzedAt}`}>
                <td>
                  <div className="repository-cell">
                    <span className="repo-avatar blue">{initials}</span>
                    <div><strong>{repositoryName}</strong><span>{repositoryBranch}</span></div>
                  </div>
                </td>
                <td><span className={`status ${status === 'Healthy' ? 'healthy' : 'issues'}`}><span />{status === 'Healthy' ? status : `${issueCount} issue${issueCount === 1 ? '' : 's'} found`}</span></td>
                <td className="time-cell">{analyzedAt}</td>
                <td><button className="row-action" type="button" aria-label={`Open ${repositoryName}`} onClick={() => onSelectAnalysis(analysis)}>&#8594;</button></td>
              </tr>
              )
            }) : (
              <tr>
                <td colSpan="4" className="time-cell">No analyses yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default RecentAnalyses
