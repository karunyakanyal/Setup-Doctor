# SetupDoctor

Paste a GitHub repository URL and see **which files are risky to change, and what breaks if you change one**, with a plain-language health grade and the evidence behind it.

![SetupDoctor overview](docs/overview.png)

## What it does

- **Risk first.** A headline and the top risky files, each with a 0-100 score and a one-line reason.
- **Impact of a change.** Pick a file: see how many files it can break directly and indirectly, which ones first, folder by folder, and which tests cover it (or that none do).
- **Dependency graph.** Cycles, orphan files, unresolved imports and entry points, counted the same way every time.
- **One grade, one reason.** A grade (A to E) with four ratings (Security, Reliability, Maintainability, Hygiene) and findings that quote the exact file and line.
- **Project profile.** Detected stack, API routes (Express and FastAPI), scripts and environment variables.
- **Dependencies.** Declared but unused, used but undeclared, and known vulnerabilities (OSV).
- **Change Impact for pull requests.** Enter a PR and get the blast radius, files that are unchanged but affected, and a copyable Markdown summary.
- **README badge** and a **health endpoint** (`/api/health`).

## What makes it different

Most reviews of a repository are opinions. SetupDoctor counts: the same repository gives the same numbers every time, and every finding points to a real file and line. It was checked against large real projects (for example `vitejs/vite`, about 1,800 mapped files).

## Quick start

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/karunyakanyal/Setup-Doctor.git
cd Setup-Doctor
npm install
npm --prefix Backend install
npm --prefix frontend install
npm run dev
```

Open http://localhost:5173. The backend runs on port 5000.

### Optional: higher GitHub limits

Without a token GitHub allows about 60 requests per hour. With a token, about 5,000.

1. Create a fine-grained GitHub token with read-only access to public repositories.
2. Create `Backend/.env`:
   ```
   GITHUB_TOKEN=your_token_here
   ```
3. Restart the backend. Open `/api/health`: `githubTokenConfigured` should be `true`.

Never commit `.env`. The token is never logged or returned by the API.

### Other settings

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Higher GitHub rate limit |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed by CORS |
| `PUBLIC_BASE_URL` | Public URL of the backend, used in the README badge |

## How to use it

1. Paste a repository URL (for example `https://github.com/owner/repo`) and press Analyze.
2. Read the headline and the top risky files.
3. Press **Inspect** on a file to see what a change can break.
4. Open **More analysis** (or switch to **Detailed**) for setup checks, dependencies, the code map and the inventory.

## Limits

- It reads `import`, `export` and `require` statements. It cannot see imports built at runtime or packages referenced only in config strings. The app shows a "How reliable is this?" note with the exact coverage of each scan.
- Python and other non-JavaScript files are listed but not mapped into the graph yet.
- Very large repositories are scanned up to a size limit and marked as truncated.

## Tests

```bash
npm test
npm run lint
```

## License

MIT (add a `LICENSE` file).