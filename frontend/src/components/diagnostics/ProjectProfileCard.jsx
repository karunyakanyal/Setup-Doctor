export default function ProjectProfileCard({ profile = null }) {
  const stacks = Array.isArray(profile?.stacks) ? profile.stacks : []
  const scripts = (profile?.scripts && typeof profile.scripts === 'object')
    ? Object.entries(profile.scripts).map(([key, val]) => ({ name: key, command: String(val) }))
    : []
  const routes = Array.isArray(profile?.routes) ? profile.routes : []
  const envVars = Array.isArray(profile?.envVars) ? profile.envVars : []
  const entryPoints = Array.isArray(profile?.entryPoints) ? profile.entryPoints : []

  const nodeVersions = profile?.nodeVersions || {}
  const hasNodeVersions = Boolean(nodeVersions.nvmrc || nodeVersions.engines || nodeVersions.ci)

  return (
    <section className="project-profile-card" aria-labelledby="project-profile-heading">
      <div className="profile-card-header">
        <div>
          <span className="eyebrow">Project analysis</span>
          <h2 id="project-profile-heading" className="profile-card-title">
            Your project profile
          </h2>
        </div>
        {profile?.ciProvider && (
          <span className="profile-badge ci-badge">
            CI: {profile.ciProvider}
          </span>
        )}
      </div>

      <div className="profile-card-grid">
        {/* Detected Stacks */}
        <div className="profile-section profile-stacks-section">
          <h3 className="profile-section-title">Detected Stacks</h3>
          {stacks.length > 0 ? (
            <div className="profile-pills-wrap">
              {stacks.map((stk) => (
                <span key={stk} className="profile-stack-pill">
                  {stk}
                </span>
              ))}
            </div>
          ) : (
            <p className="profile-empty-text">No specialized framework or stack detected.</p>
          )}
        </div>

        {/* Package Scripts */}
        <div className="profile-section profile-scripts-section">
          <h3 className="profile-section-title">Package Scripts</h3>
          {scripts.length > 0 ? (
            <div className="profile-scripts-list">
              {scripts.map((script) => (
                <div key={script.name} className="profile-script-row">
                  <code className="script-name font-mono">{script.name}</code>
                  <span className="script-arrow" aria-hidden="true">&rarr;</span>
                  <code className="script-command font-mono">{script.command}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-empty-text">No package.json scripts defined.</p>
          )}
        </div>

        {/* API Routes */}
        <div className="profile-section profile-routes-section">
          <h3 className="profile-section-title">
            API Routes {routes.length > 0 && <span className="section-count">({routes.length})</span>}
          </h3>
          {routes.length > 0 ? (
            <div className="profile-routes-list">
              {routes.map((rt, idx) => (
                <div key={`${rt.method}-${rt.path}-${idx}`} className="profile-route-row">
                  <span className={`route-method-tag method-${rt.method?.toLowerCase()}`}>
                    {rt.method}
                  </span>
                  <code className="route-path font-mono">{rt.path}</code>
                  {rt.file && <span className="route-file">{rt.file}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-empty-text">No API routes found in scanned files.</p>
          )}
        </div>

        {/* Environment Variables */}
        <div className="profile-section profile-env-section">
          <h3 className="profile-section-title">
            Environment Variables {envVars.length > 0 && <span className="section-count">({envVars.length})</span>}
          </h3>
          {envVars.length > 0 ? (
            <div className="profile-pills-wrap">
              {envVars.map((v) => (
                <span key={v} className="profile-env-pill font-mono">
                  {v}
                </span>
              ))}
            </div>
          ) : (
            <p className="profile-empty-text">No environment variables read in code.</p>
          )}
        </div>

        {/* Entry Points & Environment Specs (if any) */}
        {(entryPoints.length > 0 || hasNodeVersions || profile?.testFramework) && (
          <div className="profile-section profile-meta-section">
            <h3 className="profile-section-title">Environment &amp; Entry Points</h3>
            <div className="profile-meta-details">
              {profile?.testFramework && (
                <div className="profile-meta-item">
                  <span className="meta-label">Test Framework:</span>
                  <strong>{profile.testFramework}</strong>
                </div>
              )}
              {hasNodeVersions && (
                <div className="profile-meta-item">
                  <span className="meta-label">Node Versions:</span>
                  <span>
                    {[
                      nodeVersions.nvmrc ? `.nvmrc: ${nodeVersions.nvmrc}` : null,
                      nodeVersions.engines ? `engines: ${nodeVersions.engines}` : null,
                      nodeVersions.ci ? `CI: ${nodeVersions.ci}` : null,
                    ].filter(Boolean).join(' | ')}
                  </span>
                </div>
              )}
              {entryPoints.length > 0 && (
                <div className="profile-meta-item">
                  <span className="meta-label">Entry Points:</span>
                  <div className="profile-entry-points-list">
                    {entryPoints.slice(0, 5).map((ep) => (
                      <code key={ep} className="entry-point-tag font-mono">{ep}</code>
                    ))}
                    {entryPoints.length > 5 && (
                      <span className="more-count">+{entryPoints.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
