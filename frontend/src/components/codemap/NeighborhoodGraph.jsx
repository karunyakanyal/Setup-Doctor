import { useMemo } from 'react'

const MAX_DISPLAY = 12

function truncatePath(fullPath, maxLen = 22) {
  if (!fullPath) return ''
  if (fullPath.length <= maxLen) return fullPath
  const parts = fullPath.split('/')
  const fileName = parts.pop() || ''
  if (fileName.length >= maxLen) {
    return `${fileName.slice(0, maxLen - 3)}...`
  }
  return `.../${fileName}`
}

export default function NeighborhoodGraph({
  selectedFile,
  imports = [],
  importers = [],
  onSelectFile,
}) {
  const importersToShow = useMemo(() => {
    return importers.slice(0, MAX_DISPLAY)
  }, [importers])

  const importsToShow = useMemo(() => {
    return imports.slice(0, MAX_DISPLAY)
  }, [imports])

  const visibleNodes = useMemo(() => {
    return [selectedFile, ...importersToShow, ...importsToShow].filter(Boolean)
  }, [selectedFile, importersToShow, importsToShow])

  const basenameCounts = useMemo(() => {
    const counts = new Map()
    for (const f of visibleNodes) {
      const parts = f.split('/')
      const base = parts[parts.length - 1] || ''
      counts.set(base, (counts.get(base) || 0) + 1)
    }
    return counts
  }, [visibleNodes])

  const formatNodeLabel = (fullPath, maxLen = 22) => {
    if (!fullPath) return ''
    const parts = fullPath.split('/')
    const base = parts[parts.length - 1] || ''
    const isDuplicate = (basenameCounts.get(base) || 0) > 1

    if (isDuplicate && parts.length > 1) {
      const parentFolder = parts[parts.length - 2]
      const qualified = `${parentFolder}/${base}`
      if (qualified.length <= maxLen) return qualified
      return truncatePath(qualified, maxLen)
    }

    return truncatePath(fullPath, maxLen)
  }

  const extraImporters = importers.length - importersToShow.length
  const extraImports = imports.length - importsToShow.length

  const leftCount = importersToShow.length + (extraImporters > 0 ? 1 : 0)
  const rightCount = importsToShow.length + (extraImports > 0 ? 1 : 0)
  const maxSide = Math.max(leftCount, rightCount, 1)

  const height = Math.max(100, maxSide * 34 + 50)
  const width = 760
  const centerX = 380
  const centerY = height / 2

  const centerBoxW = 200
  const centerBoxH = 40
  const sideBoxW = 180
  const sideBoxH = 28

  const calcY = (index, total) => {
    const spacing = Math.min(34, (height - 60) / Math.max(1, total))
    const startY = centerY - ((total - 1) * spacing) / 2
    return startY + index * spacing
  }

  return (
    <div className="codemap-neighborhood-wrap" aria-label="Neighborhood graph and connections">
      <h4 className="codemap-subheading">File Neighborhood Graph</h4>

      <div className="codemap-svg-container" tabIndex={0} role="region" aria-label="Interactive dependency graph">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="codemap-neighborhood-svg"
          width="100%"
          height={height}
          role="img"
          aria-label={`Neighborhood graph for ${selectedFile}`}
        >
          {/* Header labels */}
          <text x="130" y="24" textAnchor="middle" className="svg-col-header">
            Imported By ({importers.length})
          </text>
          <text x={centerX} y="24" textAnchor="middle" className="svg-col-header">
            Selected File
          </text>
          <text x="630" y="24" textAnchor="middle" className="svg-col-header">
            Imports ({imports.length})
          </text>

          {/* Left connections (Importers -> Center) */}
          {importersToShow.map((file, idx) => {
            const y = calcY(idx, leftCount)
            const fromX = 220
            const toX = centerX - centerBoxW / 2
            const d = `M ${fromX} ${y} C ${fromX + 30} ${y}, ${toX - 30} ${centerY}, ${toX} ${centerY}`
            return (
              <path
                key={`left-edge-${file}`}
                d={d}
                className="svg-edge-path incoming"
              />
            )
          })}

          {/* Right connections (Center -> Imports) */}
          {importsToShow.map((file, idx) => {
            const y = calcY(idx, rightCount)
            const fromX = centerX + centerBoxW / 2
            const toX = 540
            const d = `M ${fromX} ${centerY} C ${fromX + 30} ${centerY}, ${toX - 30} ${y}, ${toX} ${y}`
            return (
              <path
                key={`right-edge-${file}`}
                d={d}
                className="svg-edge-path outgoing"
              />
            )
          })}

          {/* Center node */}
          <g className="svg-node-center">
            <rect
              x={centerX - centerBoxW / 2}
              y={centerY - centerBoxH / 2}
              width={centerBoxW}
              height={centerBoxH}
              rx="8"
              className="svg-rect-center"
            />
            <title>{selectedFile}</title>
            <text
              x={centerX}
              y={centerY + 4}
              textAnchor="middle"
              className="svg-text-center"
            >
              {formatNodeLabel(selectedFile, 24)}
            </text>
          </g>

          {/* Left nodes (Importers) */}
          {importersToShow.map((file, idx) => {
            const y = calcY(idx, leftCount)
            return (
              <g
                key={`left-node-${file}`}
                className="svg-node-interactive"
                tabIndex={0}
                role="button"
                aria-label={`Select ${file}`}
                onClick={() => onSelectFile && onSelectFile(file)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectFile && onSelectFile(file)
                  }
                }}
              >
                <rect
                  x="40"
                  y={y - sideBoxH / 2}
                  width={sideBoxW}
                  height={sideBoxH}
                  rx="6"
                  className="svg-rect-side"
                />
                <title>{file}</title>
                <text
                  x="130"
                  y={y + 4}
                  textAnchor="middle"
                  className="svg-text-side"
                >
                  {formatNodeLabel(file)}
                </text>
              </g>
            )
          })}

          {extraImporters > 0 && (
            <g key="left-extra" className="svg-node-extra">
              <rect
                x="40"
                y={calcY(importersToShow.length, leftCount) - sideBoxH / 2}
                width={sideBoxW}
                height={sideBoxH}
                rx="6"
                className="svg-rect-extra"
              />
              <text
                x="130"
                y={calcY(importersToShow.length, leftCount) + 4}
                textAnchor="middle"
                className="svg-text-extra"
              >
                +{extraImporters} more
              </text>
            </g>
          )}

          {/* Right nodes (Imports) */}
          {importsToShow.map((file, idx) => {
            const y = calcY(idx, rightCount)
            return (
              <g
                key={`right-node-${file}`}
                className="svg-node-interactive"
                tabIndex={0}
                role="button"
                aria-label={`Select ${file}`}
                onClick={() => onSelectFile && onSelectFile(file)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectFile && onSelectFile(file)
                  }
                }}
              >
                <rect
                  x="540"
                  y={y - sideBoxH / 2}
                  width={sideBoxW}
                  height={sideBoxH}
                  rx="6"
                  className="svg-rect-side"
                />
                <title>{file}</title>
                <text
                  x="630"
                  y={y + 4}
                  textAnchor="middle"
                  className="svg-text-side"
                >
                  {formatNodeLabel(file)}
                </text>
              </g>
            )
          })}

          {extraImports > 0 && (
            <g key="right-extra" className="svg-node-extra">
              <rect
                x="540"
                y={calcY(importsToShow.length, rightCount) - sideBoxH / 2}
                width={sideBoxW}
                height={sideBoxH}
                rx="6"
                className="svg-rect-extra"
              />
              <text
                x="630"
                y={calcY(importsToShow.length, rightCount) + 4}
                textAnchor="middle"
                className="svg-text-extra"
              >
                +{extraImports} more
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Accessible Text List */}
      <div className="codemap-neighborhood-text" aria-label="Text representation of file neighborhood">
        <div className="neighborhood-text-column">
          <h5>Imported by ({importers.length})</h5>
          {importers.length === 0 ? (
            <p className="codemap-muted-note">No other analyzed files import this file directly.</p>
          ) : (
            <ul className="neighborhood-list">
              {importers.map((p) => (
                <li key={`text-importer-${p}`}>
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => onSelectFile && onSelectFile(p)}
                    aria-label={`Select ${p}`}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="neighborhood-text-column">
          <h5>Imports ({imports.length})</h5>
          {imports.length === 0 ? (
            <p className="codemap-muted-note">This file imports no other analyzed project files.</p>
          ) : (
            <ul className="neighborhood-list">
              {imports.map((p) => (
                <li key={`text-import-${p}`}>
                  <button
                    type="button"
                    className="codemap-link-button"
                    onClick={() => onSelectFile && onSelectFile(p)}
                    aria-label={`Select ${p}`}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
