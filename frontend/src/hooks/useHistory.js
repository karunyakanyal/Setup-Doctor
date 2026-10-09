import { createContext, useContext, useState, useCallback, useMemo, createElement } from 'react'
import { safeLoad, safeSave, HISTORY_STORAGE_KEY } from '../utils/storage.js'

const HistoryContext = createContext(null)

export function countSuccessfulSetups(analysisHistory = []) {
  if (!Array.isArray(analysisHistory)) return 0

  const latestByProject = new Map()

  for (const analysis of analysisHistory) {
    const repoKey =
      analysis?.repository?.fullName ||
      analysis?.repository?.name ||
      (typeof analysis?.repository === 'string' ? analysis.repository : null)
    if (!repoKey) continue

    if (!latestByProject.has(repoKey)) {
      latestByProject.set(repoKey, analysis)
    } else {
      const existing = latestByProject.get(repoKey)
      const existingTime = existing?.analyzedAt ? new Date(existing.analyzedAt).getTime() : 0
      const currentTime = analysis?.analyzedAt ? new Date(analysis.analyzedAt).getTime() : 0
      if (currentTime > existingTime) {
        latestByProject.set(repoKey, analysis)
      }
    }
  }

  let count = 0
  for (const analysis of latestByProject.values()) {
    if (typeof analysis?.health?.score === 'number' && analysis.health.score >= 90) {
      count += 1
    }
  }

  return count
}

export function HistoryProvider({ children, initialHistory }) {
  const [analysisHistory, setAnalysisHistory] = useState(() => {
    if (initialHistory !== undefined) {
      return initialHistory
    }
    return safeLoad(HISTORY_STORAGE_KEY, [], Array.isArray)
  })

  const [selectedAnalysis, setSelectedAnalysis] = useState(null)

  const addAnalysisEntry = useCallback((repositoryData, responseHealth, summary, diagnostics) => {
    const historyEntry = {
      repository: repositoryData,
      health: responseHealth,
      summary: summary || null,
      diagnostics: diagnostics || [],
      analyzedAt: new Date().toISOString(),
    }

    setAnalysisHistory((currentHistory) => {
      const nextHistory = [historyEntry, ...currentHistory].slice(0, 5)
      safeSave(HISTORY_STORAGE_KEY, nextHistory)
      return nextHistory
    })

    return historyEntry
  }, [])

  const selectAnalysis = useCallback((analysis) => {
    setSelectedAnalysis(analysis)
  }, [])

  const issuesFound = useMemo(() => {
    return analysisHistory.reduce((total, analysis) => {
      if (analysis.summary) {
        const warnings = analysis.summary.warning || 0
        const errors = (analysis.summary.error || 0) + (analysis.summary.failed || 0)
        return total + warnings + errors
      }
      if (Array.isArray(analysis.diagnostics)) {
        const issueCount = analysis.diagnostics.filter(
          (diag) => diag.status === 'warning' || diag.status === 'error' || diag.status === 'failed',
        ).length
        return total + issueCount
      }
      return total
    }, 0)
  }, [analysisHistory])

  const successfulSetups = useMemo(() => {
    return countSuccessfulSetups(analysisHistory)
  }, [analysisHistory])

  const value = {
    analysisHistory,
    setAnalysisHistory,
    selectedAnalysis,
    setSelectedAnalysis,
    selectAnalysis,
    addAnalysisEntry,
    issuesFound,
    successfulSetups,
  }

  return createElement(HistoryContext.Provider, { value }, children)
}

export function useHistory() {
  const context = useContext(HistoryContext)
  if (context) {
    return context
  }

  // Fallback for standalone usage
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [analysisHistory, setAnalysisHistory] = useState(() =>
    safeLoad(HISTORY_STORAGE_KEY, [], Array.isArray),
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const addAnalysisEntry = useCallback((repositoryData, responseHealth, summary, diagnostics) => {
    const historyEntry = {
      repository: repositoryData,
      health: responseHealth,
      summary: summary || null,
      diagnostics: diagnostics || [],
      analyzedAt: new Date().toISOString(),
    }

    setAnalysisHistory((currentHistory) => {
      const nextHistory = [historyEntry, ...currentHistory].slice(0, 5)
      safeSave(HISTORY_STORAGE_KEY, nextHistory)
      return nextHistory
    })

    return historyEntry
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectAnalysis = useCallback((analysis) => {
    setSelectedAnalysis(analysis)
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const issuesFound = useMemo(() => {
    return analysisHistory.reduce((total, analysis) => {
      if (analysis.summary) {
        const warnings = analysis.summary.warning || 0
        const errors = (analysis.summary.error || 0) + (analysis.summary.failed || 0)
        return total + warnings + errors
      }
      if (Array.isArray(analysis.diagnostics)) {
        const issueCount = analysis.diagnostics.filter(
          (diag) => diag.status === 'warning' || diag.status === 'error' || diag.status === 'failed',
        ).length
        return total + issueCount
      }
      return total
    }, 0)
  }, [analysisHistory])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const successfulSetups = useMemo(() => {
    return countSuccessfulSetups(analysisHistory)
  }, [analysisHistory])

  return {
    analysisHistory,
    setAnalysisHistory,
    selectedAnalysis,
    setSelectedAnalysis,
    selectAnalysis,
    addAnalysisEntry,
    issuesFound,
    successfulSetups,
  }
}
