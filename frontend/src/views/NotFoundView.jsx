import { Link } from 'react-router-dom'

function NotFoundView() {
  return (
    <section className="repository-summary bug-vault-empty" aria-label="Page not found">
      <h2>404 - Page Not Found</h2>
      <p className="welcome-copy">
        The requested page could not be found. Check the URL or return to the Dashboard.
      </p>
      <Link to="/" className="primary-button" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
        Return to Dashboard
      </Link>
    </section>
  )
}

export default NotFoundView
