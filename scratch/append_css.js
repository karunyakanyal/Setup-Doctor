const fs = require('fs');
const cssToAppend = `
/* ==========================================================================
   Phase 5: Project Profile, Dimension Ratings, Severity Findings & Badges
   ========================================================================== */

/* Project Profile Card */
.project-profile-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
  min-width: 0;
  overflow-wrap: anywhere;
}

.profile-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.profile-card-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.profile-badge.ci-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.profile-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.profile-section {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
}

.profile-section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.profile-section-title .section-count {
  color: #64748b;
  font-weight: 600;
  text-transform: none;
}

.profile-pills-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-stack-pill,
.profile-env-pill {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #cbd5e1;
}

.profile-env-pill {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: #f1f5f9;
  color: #0f172a;
}

.profile-scripts-list,
.profile-routes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.profile-script-row,
.profile-route-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
}

.script-name {
  font-weight: 700;
  color: #2563eb;
}

.script-arrow {
  color: #94a3b8;
}

.script-command {
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.route-method-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.route-method-tag.method-get { background: #dcfce7; color: #15803d; }
.route-method-tag.method-post { background: #dbeafe; color: #1d4ed8; }
.route-method-tag.method-put { background: #fef3c7; color: #b45309; }
.route-method-tag.method-delete { background: #fee2e2; color: #b91c1c; }
.route-method-tag.method-patch { background: #f3e8ff; color: #7e22ce; }

.route-path {
  font-weight: 600;
  color: #0f172a;
}

.route-file {
  margin-left: auto;
  font-size: 11px;
  color: #64748b;
}

.profile-empty-text {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  font-style: italic;
}

.profile-meta-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.profile-meta-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-entry-points-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.entry-point-tag {
  padding: 2px 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
}

/* Dimension Rating Tiles */
.dimension-ratings-section {
  margin-bottom: 24px;
}

.dimension-section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.overall-dimension-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.overall-grade-tag {
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 800;
}

.overall-grade-tag.grade-a { background: #dcfce7; color: #15803d; }
.overall-grade-tag.grade-b { background: #dbeafe; color: #1d4ed8; }
.overall-grade-tag.grade-c { background: #fef3c7; color: #b45309; }
.overall-grade-tag.grade-d { background: #ffedd5; color: #c2410c; }
.overall-grade-tag.grade-e { background: #fee2e2; color: #b91c1c; }

.overall-cap-tag {
  color: #b45309;
  font-size: 12px;
}

.dimension-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 14px;
}

.dimension-tile {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dimension-tile.grade-a { border-color: #86efac; background: #f0fdf4; }
.dimension-tile.grade-b { border-color: #93c5fd; background: #f0f9ff; }
.dimension-tile.grade-c { border-color: #fde047; background: #fefce8; }
.dimension-tile.grade-d { border-color: #fdba74; background: #fff7ed; }
.dimension-tile.grade-e { border-color: #fca5a5; background: #fef2f2; }

.tile-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dimension-tile-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dimension-grade-badge {
  font-size: 18px;
  font-weight: 800;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.grade-badge-a { background: #22c55e; color: #ffffff; }
.grade-badge-b { background: #3b82f6; color: #ffffff; }
.grade-badge-c { background: #eab308; color: #ffffff; }
.grade-badge-d { background: #f97316; color: #ffffff; }
.grade-badge-e { background: #ef4444; color: #ffffff; }

.dimension-score-text {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.dimension-reason-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: #64748b;
}

/* Findings Grouped By Severity */
.severity-findings-section {
  margin-bottom: 24px;
}

.simple-mode-intro {
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.detailed-findings-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.severity-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
}

.severity-group-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.severity-group-count {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.severity-zero-state-line {
  margin: 0;
  font-size: 13px;
  color: #059669;
  font-style: italic;
  padding: 10px 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
}

.findings-cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.severity-finding-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.severity-finding-card.severity-critical {
  border-left: 4px solid #ef4444;
}

.severity-finding-card.severity-important {
  border-left: 4px solid #f97316;
}

.severity-finding-card.severity-nice-to-have {
  border-left: 4px solid #3b82f6;
}

.finding-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.finding-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.finding-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.finding-dimension-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  background: #f1f5f9;
  color: #475569;
}

.finding-severity-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
}

.finding-severity-badge.severity-critical {
  background: #fee2e2;
  color: #b91c1c;
}

.finding-severity-badge.severity-important {
  background: #ffedd5;
  color: #c2410c;
}

.finding-severity-badge.severity-nice-to-have {
  background: #eff6ff;
  color: #1d4ed8;
}

.finding-body-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
}

.finding-label {
  color: #475569;
  font-size: 12px;
  min-width: 32px;
}

.finding-why-text {
  color: #1e293b;
  line-height: 1.4;
}

.finding-fix-code {
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #0f172a;
  flex: 1;
  word-break: break-all;
}

.copy-fix-btn {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #2563eb;
  color: #ffffff;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}

.copy-fix-btn.copied {
  background: #16a34a;
}

.finding-evidence-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.finding-evidence-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.evidence-line-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 11px;
}

.evidence-file {
  font-weight: 600;
  color: #2563eb;
}

.evidence-snippet {
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 500px;
}

.evidence-more-badge {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  padding-left: 4px;
}

.finding-children-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
}

.finding-children-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.finding-child-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.child-name {
  font-weight: 600;
  color: #334155;
}

.child-why {
  color: #64748b;
}

.finding-footer-row {
  margin-top: 4px;
}

.finding-docs-link {
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  text-decoration: none;
}

.finding-docs-link:hover {
  text-decoration: underline;
}

.findings-zero-state {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 24px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 10px;
}

.zero-icon {
  font-size: 24px;
  font-weight: 800;
  color: #16a34a;
}

.zero-content strong {
  color: #15803d;
  font-size: 15px;
}

.zero-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: #166534;
}

/* Changes pill and Badge in ProjectGlanceCard */
.glance-changes-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 700;
  margin-top: 8px;
  border: 1px solid #bae6fd;
}

.glance-badge-section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.badge-preview-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.badge-preview-img {
  height: 20px;
  vertical-align: middle;
}

.badge-copy-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 550px;
}

.badge-markdown-code {
  flex: 1;
  padding: 4px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-copy-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: #2563eb;
  color: #ffffff;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}

.badge-copy-btn.copied {
  background: #16a34a;
}
`;

let originalCss = fs.readFileSync('frontend/src/App.css', 'utf8');
if (!originalCss.includes('Phase 5: Project Profile')) {
  fs.writeFileSync('frontend/src/App.css', originalCss + '\n' + cssToAppend, 'utf8');
  console.log('Appended Phase 5 styles to App.css');
} else {
  console.log('Phase 5 styles already present');
}
