function DiagnosticsEmptyState({ activeFilter = 'all', onResetFilter }) {
  const messages = {
    all: 'No diagnostic checks found for this repository.',
    fail: 'Great job! Zero failed checks detected.',
    warn: 'No warnings found for this repository setup.',
    info: 'No informational notes for this repository.',
    pass: 'No passed checks found under this selection.',
  }

  const message = messages[activeFilter] || 'No diagnostic checks match the selected filter.'

  return (
    <div className="diagnostics-empty-state" role="status">
      <div className="empty-icon" aria-hidden="true">&#9776;</div>
      <p className="empty-title">{message}</p>
      {activeFilter !== 'all' && onResetFilter && (
        <button
          type="button"
          className="btn-secondary empty-reset-btn"
          onClick={() => onResetFilter('all')}
        >
          View all checks
        </button>
      )}
    </div>
  )
}

export default DiagnosticsEmptyState
