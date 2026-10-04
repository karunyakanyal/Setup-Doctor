# SetupDoctor

> Repository diagnostics and troubleshooting knowledge vault for modern development setups.

[![CI](https://github.com/setup-doctor/setup-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/setup-doctor/setup-doctor/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-live-blue.svg)](https://setup-doctor.example.com)

---

## Live Demo & Screenshots

- **Live Demo**: [Launch SetupDoctor](https://setup-doctor.example.com) *(Demo link placeholder)*

### Screenshots

<!-- Add screenshots to docs/screenshots/ -->
| Repository Diagnostics & Health Score | Bug Vault & Smart Suggestions |
| :---: | :---: |
| ![Diagnostics Overview](docs/screenshots/dashboard.png) | ![Bug Vault](docs/screenshots/bug-vault.png) |

---

## Features

- **Repository Diagnostics with 0–100 Health Score**: Comprehensive health evaluation calculating a transparent score with prioritized findings (high, medium, low).
- **16+ Diagnostic Rules**: Automated verification covering:
  - Node engine specifications (`engines.node`)
  - Duplicate dependencies across `dependencies` and `devDependencies`
  - Valid semver version ranges and React/React-DOM version parity
  - Lockfile presence, lockfile collision, and package manager consistency
  - Build, dev, and test scripts in `package.json`
  - Framework dependencies (`react`, `react-dom`, `vite`, `eslint`, `typescript`)
  - Safety checks for `.env`, `.env.example`, and `.gitignore`
- **Bug Vault Knowledge Base**: Catalog recurring environment issues and verified fixes organized by built-in system categories (Environment, Dependencies, Configuration, Build, Runtime, etc.) or custom categories.
- **Search & Similar-Bug Suggestions**: Real-time full-text search across errors, causes, and solutions, plus automatic similarity matching that recommends existing fixes while composing bug reports.
- **Export & Import**: Seamless JSON export (`setupdoctor-bug-vault-YYYY-MM-DD.json`) and import with schema normalization, integrity validation, and conflict resolution.

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vite.dev/)
- **Backend**: [Express 5](https://expressjs.com/), [Node.js](https://nodejs.org/) native test runner (`node:test`, `node:assert/strict`)
- **Persistence**: Schema-versioned browser `localStorage` with automated migration, data integrity checks, and error fallbacks

---

## How It Works

1. **Analyze**: Enter any public GitHub repository (owner, repository name, branch) to fetch file trees and manifest configurations securely.
2. **Diagnose**: SetupDoctor evaluates 16+ rules against package definitions, scripts, lockfiles, and environment files to compute a 0–100 health score.
3. **Prioritize**: Review categorized issues with clear rationales, priority tags, and actionable recommendations.
4. **Save to Bug Vault**: Turn recurring friction points and verified setup fixes into reusable knowledge entries with auto-categorization and instant similarity lookup.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20.x or v22.x
- [npm](https://www.npmjs.com/) v10+

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/setup-doctor.git
   cd setup-doctor
   ```

2. **Install dependencies**:
   ```bash
   npm install
   npm install --prefix Backend
   npm install --prefix frontend
   ```

3. **Configure environment variables**:
   Copy the backend environment template:
   ```bash
   cp Backend/.env.example Backend/.env
   ```
   Edit `Backend/.env`:
   - `GITHUB_TOKEN`: *(Optional, recommended)* A fine-grained GitHub Personal Access Token (public repositories read-only). Adding a token increases GitHub API rate limits from 60 requests/hour to 5,000 requests/hour.
   - `ALLOWED_ORIGINS`: *(Optional)* Comma-separated list of allowed CORS origins. Defaults to `http://localhost:5173,http://127.0.0.1:5173`.

4. **Start the development servers**:
   ```bash
   npm run dev
   ```

5. **Open the applications**:
   - **Frontend UI**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:5000](http://localhost:5000)

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Runs Backend (`nodemon`) and frontend (`vite`) concurrently |
| `npm test` | Runs the full test suite across Backend and frontend (`node:test`) |
| `npm run lint` | Runs ESLint across the frontend codebase |
| `npm run build` | Builds the frontend production bundle (`npm --prefix frontend run build`) |

---

## Project Structure

```text
Setup-Doctor/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (lint, test, build)
├── Backend/
│   ├── src/
│   │   ├── rules.js           # Diagnostic rules engine & health scoring
│   │   ├── server.js          # Express 5 server & GitHub API proxy
│   │   └── server.test.js     # Native Node.js backend integration tests
│   ├── .env.example           # Backend environment template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # Header, Sidebar, StatCard, AnalysisModal, etc.
│   │   ├── utils/             # Storage, transfer, categorization & similarity
│   │   ├── App.jsx            # Main application & Bug Vault view
│   │   └── main.jsx           # React root entry point
│   ├── vite.config.js         # Vite configuration with /api backend proxy
│   └── package.json
├── package.json               # Root monorepo orchestration scripts
└── README.md                  # Project documentation
```

---

## Roadmap

- [ ] **DevContext Module**: Local machine environment detection (Node, npm, OS, path bindings) to diagnose local workstation setups alongside repositories.
- [ ] **Backend Caching**: In-memory and persistent caching layer for GitHub file trees and dependency payloads to optimize repeat analyses.
- [ ] **React Router**: Full declarative routing for deep-linking into individual analyses, diagnostic reports, and Bug Vault entries.

---

## License

ISC License.
