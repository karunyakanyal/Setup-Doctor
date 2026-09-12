const icons = {
  projects: <><path d="M3 8.5 12 4l9 4.5v9L12 22l-9-4.5z" /><path d="M3 8.5 12 13l9-4.5M12 13v9" /></>,
  issues: <><path d="M12 3 2.8 19h18.4z" /><path d="M12 9v4M12 16h.01" /></>,
  success: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
}

function StatCard({ label, value, detail, icon, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{icons[icon]}</svg>
      </div>
      <div className="stat-content">
        <p>{label}</p>
        <div className="stat-value-row">
          <strong>{value}</strong>
          <span className={`stat-detail ${tone}`}>{detail}</span>
        </div>
      </div>
    </article>
  )
}

export default StatCard
