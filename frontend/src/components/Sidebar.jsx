const navigationItems = [
  { label: 'Dashboard', icon: 'grid', active: true },
  { label: 'Projects', icon: 'folder' },
  { label: 'Analyses', icon: 'pulse' },
  { label: 'History', icon: 'clock' },
]

function NavIcon({ type }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /><path d="M3 10h18" /></>,
    pulse: <><path d="M3 12h4l2.2-6 4.2 12 2.2-6H21" /><path d="M4 4v2M20 18v2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    settings: <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="3.5" /></>,
  }

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>Setup<span className="brand-accent">Doctor</span></span>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navigationItems.map((item) => (
            <a className={`nav-item ${item.active ? 'active' : ''}`} href="#" key={item.label}>
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
              {item.label === 'Analyses' && <span className="nav-count">12</span>}
            </a>
          ))}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <a className="nav-item" href="#">
          <NavIcon type="settings" />
          <span>Settings</span>
        </a>
        <div className="help-card">
          <span className="help-icon">?</span>
          <div>
            <strong>Need a hand?</strong>
            <span>Check the docs</span>
          </div>
          <span className="arrow">&#8599;</span>
        </div>
        <p className="version">SETUPDOCTOR <span>v1.0.0</span></p>
      </div>
    </aside>
  )
}

export default Sidebar
