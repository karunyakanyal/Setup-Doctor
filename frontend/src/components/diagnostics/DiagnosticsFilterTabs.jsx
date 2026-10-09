function DiagnosticsFilterTabs({
  counts = { all: 0, fail: 0, warn: 0, info: 0, pass: 0 },
  activeFilter = 'all',
  onSelectFilter,
  showPassed = false,
  onToggleShowPassed,
}) {
  const tabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'fail', label: 'Fail', count: counts.fail },
    { id: 'warn', label: 'Warn', count: counts.warn },
    { id: 'info', label: 'Info', count: counts.info },
    { id: 'pass', label: 'Pass', count: counts.pass },
  ]

  function handleKeyDown(event, index) {
    let nextIndex = null
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    }

    if (nextIndex !== null) {
      event.preventDefault()
      const nextTab = tabs[nextIndex]
      onSelectFilter(nextTab.id)
      const el = document.getElementById(`filter-tab-${nextTab.id}`)
      if (el) el.focus()
    }
  }

  return (
    <div className="diagnostics-controls-bar">
      <div
        className="diagnostics-filter-tabs"
        role="tablist"
        aria-label="Severity filter options"
      >
        {tabs.map((tab, idx) => {
          const isSelected = activeFilter === tab.id
          return (
            <button
              key={tab.id}
              id={`filter-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`filter-tab-button ${isSelected ? 'active' : ''} tab-${tab.id}`}
              onClick={() => onSelectFilter(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              <span className="tab-label">{tab.label}</span>
              <span className={`tab-count count-${tab.id}`}>{tab.count}</span>
            </button>
          )
        })}
      </div>

      {activeFilter === 'all' && counts.pass > 0 && (
        <button
          type="button"
          className="toggle-passed-button"
          onClick={onToggleShowPassed}
          aria-expanded={showPassed}
          aria-controls="passing-diagnostics-group"
        >
          {showPassed ? `Hide ${counts.pass} passed` : `Show ${counts.pass} passed`}
        </button>
      )}
    </div>
  )
}

export default DiagnosticsFilterTabs
