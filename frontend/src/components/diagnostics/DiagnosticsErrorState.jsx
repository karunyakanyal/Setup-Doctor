const GENERIC_ERROR_MESSAGE =
  'We encountered a problem fetching the manifest or tree for this repository. Please verify network connectivity, GitHub access, or branch name.'

function getDiagnosticsErrorMessage(error, message) {
  if (typeof message === 'string' && message.trim()) {
    return message
  }

  if (!error) {
    return GENERIC_ERROR_MESSAGE
  }

  if (typeof error === 'string') {
    return error
  }

  if (error.code === 'NO_PACKAGE_JSON') {
    return 'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.'
  }

  if (error.status === 429 || error.code === 429) {
    return error.message || 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.'
  }

  return GENERIC_ERROR_MESSAGE
}

function DiagnosticsErrorState({ onRetry, error, message }) {
  const displayMessage = getDiagnosticsErrorMessage(error, message)

  return (
    <div className="diagnostics-error-alert" role="alert">
      <div className="error-alert-content">
        <span className="error-alert-icon" aria-hidden="true">&#9888;</span>
        <div>
          <h4 className="error-alert-title">Unable to run repository diagnostics</h4>
          <p className="error-alert-message">
            {displayMessage}
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
