function DiagnosticsErrorState({ onRetry }) {
  return (
    <div className="diagnostics-error-alert" role="alert">
      <div className="error-alert-content">
        <span className="error-alert-icon" aria-hidden="true">&#9888;</span>
        <div>
          <h4 className="error-alert-title">Unable to run repository diagnostics</h4>
          <p className="error-alert-message">
            We encountered a problem fetching the manifest or tree for this repository.
            Please verify network connectivity, GitHub access, or branch name.
          </p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          className="btn-primary error-retry-btn"
          onClick={onRetry}
        >
          Retry Diagnostics
        </button>
      )}
    </div>
  )
}

export default DiagnosticsErrorState
