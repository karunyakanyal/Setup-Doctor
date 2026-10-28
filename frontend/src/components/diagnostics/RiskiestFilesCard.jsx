import { useMemo } from 'react'
import { calculateRiskiestFiles } from '../../utils/projectGlance.js'

export default function RiskiestFilesCard({
  graph = null,
  cycles = [],
  includeNonProd = false,
  onInspectFile,
}) {
  const riskiestFiles = useMemo(() => {
    return calculateRiskiestFiles({ graph, cycles, includeNonProd, limit: 5 })
  }, [graph, cycles, includeNonProd])

  if (!riskiestFiles || riskiestFiles.length === 0) {
    return null
  }

  return (
    <section className="riskiest-files-card" aria-labelledby="riskiest-files-heading">
      <div className="card-header">
        <div>
          <span className="eyebrow">Maintenance priorities</span>
          <h3 id="riskiest-files-heading" className="card-title">
            Riskiest files
          </h3>
        </div>
        <span className="riskiest-files-badge font-mono">Top {riskiestFiles.length}</span>
      </div>

      <p className="card-subtitle">
        Scored by incoming fan-in (weight 3), downstream impact (weight 2), cycle membership (+25), lack of test coverage (+20), and file size.
      </p>

      <div className="riskiest-files-list">
        {riskiestFiles.map((file, idx) => (
          <div key={file.path} className="riskiest-file-row">
            <span className="risk-rank-badge font-mono">#{idx + 1}</span>
            <div className="risk-file-info">
              <strong className="risk-file-path font-mono" title={file.path}>
                {file.path}
              </strong>
              <span className="risk-file-reason">{file.reason}</span>
            </div>
            <button
              type="button"
              className="btn-inspect-mini"
              onClick={() => onInspectFile && onInspectFile(file.path)}
              aria-label={`Inspect ${file.path}`}
            >
              Inspect
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
