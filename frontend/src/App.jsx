import { Routes, Route, useLocation } from 'react-router-dom'
import './App.css'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import { BugVaultProvider } from './hooks/useBugVault'
import { HistoryProvider } from './hooks/useHistory'
import { ProjectsProvider } from './hooks/useProjects'
import BugVaultView from './views/BugVaultView'
import DashboardView from './views/DashboardView'
import HistoryView from './views/HistoryView'
import NotFoundView from './views/NotFoundView'
import ProjectsView from './views/ProjectsView'

const user = { name: 'Alex Kim', initials: 'AK' }

function App() {
  const location = useLocation()

  return (
    <ProjectsProvider>
      <HistoryProvider>
        <BugVaultProvider>
          <div className="app-shell">
            <Sidebar />

            <div className="page-shell">
              <Header user={user} />

              <main className="dashboard-main">
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<DashboardView user={user} />} />
                    <Route path="/projects" element={<ProjectsView />} />
                    <Route path="/history" element={<HistoryView />} />
                    <Route path="/bug-vault" element={<BugVaultView key="vault" />} />
                    <Route path="/bug-vault/:id" element={<BugVaultView key={location.pathname} />} />
                    <Route path="*" element={<NotFoundView />} />
                  </Routes>
                </ErrorBoundary>
              </main>
            </div>
          </div>
        </BugVaultProvider>
      </HistoryProvider>
    </ProjectsProvider>
  )
}

export default App
