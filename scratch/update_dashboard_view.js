const fs = require('fs');

let code = fs.readFileSync('frontend/src/views/DashboardView.jsx', 'utf8');

// 1. Add imports
const importTarget = `import WhatToDoNextPanel from '../components/diagnostics/WhatToDoNextPanel'`;
const importReplacement = `import WhatToDoNextPanel from '../components/diagnostics/WhatToDoNextPanel'
import ProjectProfileCard from '../components/diagnostics/ProjectProfileCard'
import DimensionRatingTiles from '../components/diagnostics/DimensionRatingTiles'
import FindingsGroupedBySeverity from '../components/diagnostics/FindingsGroupedBySeverity'`;

// 2. Add components after glance-and-actions-section
const sectionTarget = `          <WhatToDoNextPanel
            diagnostics={diagnostics}
            deepScanData={deepScanData}
            deepScanStatus={deepScanStatus}
            includeNonProd={includeNonProd}
            onInspectFile={() => {
              setViewMode('detailed')
              const el = document.getElementById('codemap-panel-heading') || document.getElementById('technical-details-title')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          />
        </section>
      )}`;

const sectionReplacement = `          <WhatToDoNextPanel
            diagnostics={diagnostics}
            deepScanData={deepScanData}
            deepScanStatus={deepScanStatus}
            includeNonProd={includeNonProd}
            onInspectFile={() => {
              setViewMode('detailed')
              const el = document.getElementById('codemap-panel-heading') || document.getElementById('technical-details-title')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
          />
        </section>
      )}

      {repository && !isDiagnosticsLoading && !diagnosticsError && (deepScanData?.profile || deepScanData?.summary?.profile) && (
        <ProjectProfileCard
          profile={deepScanData.profile || deepScanData.summary?.profile}
          repository={repository}
        />
      )}

      {repository && !isDiagnosticsLoading && !diagnosticsError && (deepScanData?.dimensions || deepScanData?.summary?.dimensions) && (
        <DimensionRatingTiles
          dimensions={deepScanData.dimensions || deepScanData.summary?.dimensions}
        />
      )}

      {repository && !isDiagnosticsLoading && !diagnosticsError && (
        <FindingsGroupedBySeverity
          findings={deepScanData?.findings || deepScanData?.summary?.findings || []}
          viewMode={viewMode}
          onSwitchToDetailed={() => setViewMode('detailed')}
        />
      )}`;

const normCode = code.replace(/\r\n/g, '\n');
const normImportTarget = importTarget.replace(/\r\n/g, '\n');
const normImportReplacement = importReplacement.replace(/\r\n/g, '\n');
const normSectionTarget = sectionTarget.replace(/\r\n/g, '\n');
const normSectionReplacement = sectionReplacement.replace(/\r\n/g, '\n');

if (!normCode.includes(normImportTarget)) {
  console.error('Import target not found');
  process.exit(1);
}
if (!normCode.includes(normSectionTarget)) {
  console.error('Section target not found');
  process.exit(1);
}

let updated = normCode.replace(normImportTarget, normImportReplacement);
updated = updated.replace(normSectionTarget, normSectionReplacement);

if (code.includes('\r\n')) {
  updated = updated.replace(/\n/g, '\r\n');
}

fs.writeFileSync('frontend/src/views/DashboardView.jsx', updated, 'utf8');
console.log('Successfully updated DashboardView.jsx');
