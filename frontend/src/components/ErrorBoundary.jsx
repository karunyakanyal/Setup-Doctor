import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="repository-summary error-boundary-fallback" role="alert">
          <h2>Something went wrong</h2>
          <p className="welcome-copy">
            An unexpected error occurred while rendering this view.
          </p>
          {this.state.error?.message && (
            <p className="form-error">{this.state.error.message}</p>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={this.handleRetry}
            style={{ marginTop: '1rem' }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
