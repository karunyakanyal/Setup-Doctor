import { createContext, useContext, useState, useCallback, useMemo, createElement } from 'react'
import { safeLoad, safeSave, HISTORY_STORAGE_KEY } from '../utils/storage.js'

const HistoryContext = createContext(null)

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
    return analysisHistory.filter(
      (analysis) => typeof analysis.health?.score === 'number' && analysis.health.score >= 90,
    ).length
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
    return analysisHistory.filter(
      (analysis) => typeof analysis.health?.score === 'number' && analysis.health.score >= 90,
    ).length
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
