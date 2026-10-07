import { createContext, useContext, useState, useCallback, createElement } from 'react'
import { safeLoad, safeSave, PROJECTS_STORAGE_KEY } from '../utils/storage.js'

const ProjectsContext = createContext(null)

export function ProjectsProvider({ children, initialProjects }) {
  const [projects, setProjects] = useState(() => {
    if (initialProjects !== undefined) {
      return initialProjects
    }
    return safeLoad(PROJECTS_STORAGE_KEY, [], Array.isArray)
  })

  const recordProjectAnalysis = useCallback((repositoryData, responseHealth) => {
    setProjects((currentProjects) => {
      const lastAnalyzedAt = new Date().toISOString()
      const projectIndex = currentProjects.findIndex(
        (project) => project.repository?.fullName === repositoryData.fullName,
      )

      const nextProjects = projectIndex === -1
        ? [
            ...currentProjects,
            {
              repository: repositoryData,
              health: responseHealth,
              lastAnalyzedAt,
              analysisCount: 1,
            },
          ]
        : currentProjects.map((project, index) =>
            index === projectIndex
              ? {
                  ...project,
                  health: responseHealth,
                  lastAnalyzedAt,
                  analysisCount: project.analysisCount + 1,
                }
              : project,
          )

      safeSave(PROJECTS_STORAGE_KEY, nextProjects)
      return nextProjects
    })
  }, [])

  const value = {
    projects,
    setProjects,
    recordProjectAnalysis,
  }

  return createElement(ProjectsContext.Provider, { value }, children)
}

export function useProjects() {
  const context = useContext(ProjectsContext)
  if (context) {
    return context
  }

  // Fallback for standalone usage
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [projects, setProjects] = useState(() =>
    safeLoad(PROJECTS_STORAGE_KEY, [], Array.isArray),
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const recordProjectAnalysis = useCallback((repositoryData, responseHealth) => {
    setProjects((currentProjects) => {
      const lastAnalyzedAt = new Date().toISOString()
      const projectIndex = currentProjects.findIndex(
        (project) => project.repository?.fullName === repositoryData.fullName,
      )

      const nextProjects = projectIndex === -1
        ? [
            ...currentProjects,
            {
              repository: repositoryData,
              health: responseHealth,
              lastAnalyzedAt,
              analysisCount: 1,
            },
          ]
        : currentProjects.map((project, index) =>
            index === projectIndex
              ? {
                  ...project,
                  health: responseHealth,
                  lastAnalyzedAt,
                  analysisCount: project.analysisCount + 1,
                }
              : project,
          )

      safeSave(PROJECTS_STORAGE_KEY, nextProjects)
      return nextProjects
    })
  }, [])

  return { projects, setProjects, recordProjectAnalysis }
}
