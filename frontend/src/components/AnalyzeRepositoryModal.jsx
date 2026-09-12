import { useEffect, useState } from 'react'

function AnalyzeRepositoryModal({ onClose, onSuccess }) {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  function validateRepositoryUrl(value) {
    const githubUrlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i
    return githubUrlPattern.test(value.trim())
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedUrl = repositoryUrl.trim()

    if (!trimmedUrl) {
      setError('Enter a GitHub repository URL.')
      return
    }

    if (!validateRepositoryUrl(trimmedUrl)) {
      setError('Enter a valid GitHub repository URL, such as https://github.com/owner/repository.')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: trimmedUrl }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.message || 'Unable to analyze the repository.')
        return
      }

      onSuccess(data)
    } catch {
      setError('Unable to connect to the backend. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropClick}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="analyze-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">New analysis</p>
            <h2 id="analyze-modal-title">Analyze Repository</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close modal">&#10005;</button>
        </div>
        <p className="modal-description">Add a public GitHub repository to check its setup and identify potential issues.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label className="modal-label" htmlFor="repository-url">GitHub repository URL</label>
          <input
            className={`repository-input ${error ? 'has-error' : ''}`}
            id="repository-url"
            type="url"
            value={repositoryUrl}
            onChange={(event) => {
              setRepositoryUrl(event.target.value)
              if (error) setError('')
            }}
            placeholder="https://github.com/owner/repository"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'repository-error' : undefined}
            autoFocus
          />
          {error && <p className="form-error" id="repository-error">{error}</p>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={isLoading}>{isLoading ? 'Analyzing...' : 'Analyze Repository'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default AnalyzeRepositoryModal
