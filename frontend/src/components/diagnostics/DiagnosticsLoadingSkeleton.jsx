function DiagnosticsLoadingSkeleton() {
  return (
    <div className="diagnostics-loading-skeleton" aria-live="polite" aria-busy="true">
      <div className="skeleton-announcement">
        <span className="spinner-icon" aria-hidden="true" />
        <p className="diagnostics-message">
          Running diagnostics... Checking configuration and dependencies.
        </p>
      </div>

      <div className="skeleton-cards-grid">
        <div className="skeleton-card skeleton-pulse">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-text" />
          <div className="skeleton-line skeleton-subtext" />
        </div>

        <div className="skeleton-card skeleton-pulse">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-text" />
        </div>

        <div className="skeleton-card skeleton-pulse">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-text" />
          <div className="skeleton-line skeleton-subtext" />
        </div>
      </div>
    </div>
  )
}

export default DiagnosticsLoadingSkeleton
