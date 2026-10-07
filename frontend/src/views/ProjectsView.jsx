import { useNavigate } from 'react-router-dom'
import { useProjects } from '../hooks/useProjects'
import { useHistory } from '../hooks/useHistory'

function ProjectsView() {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { analysisHistory, selectAnalysis } = useHistory()

  function handleSelectProject(project) {
    const projectFullName = project.repository?.fullName
    const latestAnalysis = analysisHistory.find(
      (analysis) => analysis.repository?.fullName === projectFullName,
    )

    selectAnalysis(latestAnalysis || null)
    navigate('/history')
  }

  return (
    <section aria-labelledby="projects-view-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 id="projects-view-title">Projects</h1>
        </div>
      </div>

      {projects.length ? (
        projects.map((project) => (
          <div
            className="repository-summary"
            key={project.repository?.fullName || project.repository?.name}
            role="button"
            tabIndex={0}
            onClick={() => handleSelectProject(project)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleSelectProject(project)
              }
            }}
            aria-label={`View analysis for ${project.repository?.fullName || 'repository'}`}
            style={{ cursor: 'pointer' }}
          >
            <div className="repository-summary-heading">
              <div>
                <p className="eyebrow">Repository</p>
                <h2>{project.repository?.fullName || 'Unknown repository'}</h2>
              </div>
            </div>

            <div className="repository-details">
              <div>
                <span>Default branch</span>
                <strong>{project.repository?.defaultBranch || 'Unknown branch'}</strong>
              </div>

              <div>
                <span>Analysis count</span>
                <strong>{project.analysisCount}</strong>
              </div>

              <div>
                <span>Last analyzed</span>
                <strong>
                  {project.lastAnalyzedAt
                    ? new Date(project.lastAnalyzedAt).toLocaleString()
                    : 'Unknown time'}
                </strong>
              </div>
            </div>

            <div className="diagnostics-health">
              <strong>{project.health?.score ?? 'Unknown'} / 100</strong>
              <span
                className={`health-status health-${project.health?.status
                  ?.toLowerCase()
                  .replace(/\s+/g, '-') || 'unknown'}`}
              >
                {project.health?.status || 'Unknown'}
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="repository-summary bug-vault-empty">
          <h2>No projects analyzed yet</h2>
          <p className="welcome-copy">
            Analyze a repository from the Dashboard to see it listed here.
          </p>
        </div>
      )}
    </section>
  )
}

export default ProjectsView
