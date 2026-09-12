function Header({ activePage }) {
  const pageLabels = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    history: 'History',
  }

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span>
        <span className="breadcrumb-separator">/</span>
        <strong>{pageLabels[activePage] || pageLabels.dashboard}</strong>
      </div>
      <div className="profile-area">
        <button className="icon-button" type="button" aria-label="View notifications">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          <span className="notification-dot" />
        </button>
        <span className="profile-divider" />
        <div className="profile">
          <span className="avatar">AK</span>
          <span className="profile-name">Alex Kim</span>
          <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </div>
      </div>
    </header>
  )
}

export default Header
