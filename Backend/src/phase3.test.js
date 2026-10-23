const test = require('node:test')
const assert = require('node:assert/strict')
const { extractProjectProfile, extractProjectRoutes, joinRoutePaths } = require('./services/projectRules')
const { handleBadge } = require('./routes/repository')
const { setPreviousScan, clearPreviousScans, setCachedGraph, clearGraphCache } = require('./services/graph')

test('Phase 3: joinRoutePaths normalizes multiple segments cleanly', () => {
	assert.equal(joinRoutePaths('/api/v1', '/auth', '/login'), '/api/v1/auth/login')
	assert.equal(joinRoutePaths('/api/v1/auth', '/'), '/api/v1/auth')
	assert.equal(joinRoutePaths('/api/v1/auth', ''), '/api/v1/auth')
	assert.equal(joinRoutePaths('', '/login'), '/login')
	assert.equal(joinRoutePaths('/', '/'), '/')
	assert.equal(joinRoutePaths('/api/', '/users/', '/:id/'), '/api/users/:id')
})

test('Phase 3: FastAPI APIRouter(prefix=...) and include_router(prefix=...) resolve full path and group by file', () => {
	const filesMap = new Map([
		[
			'app/main.py',
			{
				text: `
from fastapi import FastAPI
from app.routers import auth, users

app = FastAPI()

app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(users.router, prefix="/api/v1/users")

@app.get("/health")
def health():
    return {"status": "ok"}
`,
			},
		],
		[
			'app/routers/auth.py',
			{
				text: `
from fastapi import APIRouter

router = APIRouter(prefix="/jwt")

@router.post("/login")
def login():
    pass

@router.post("/refresh")
def refresh():
    pass
`,
			},
		],
		[
			'app/routers/users.py',
			{
				text: `
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_users():
    pass

@router.get("/{id}")
def get_user(id: int):
    pass
`,
			},
		],
	])

	const profile = extractProjectProfile({ filesMap })
	assert.ok(profile.routes, 'profile has routes array')
	assert.ok(profile.routesByFile, 'profile has routesByFile object')

	// Check total routes
	assert.equal(profile.routes.length, 5)

	// Direct route on app
	const health = profile.routes.find((r) => r.path === '/health')
	assert.ok(health, 'Direct route /health found')
	assert.equal(health.method, 'GET')
	assert.equal(health.file, 'app/main.py')

	// Nested router: /api/v1/auth + /jwt + /login -> /api/v1/auth/jwt/login
	const login = profile.routes.find((r) => r.path === '/api/v1/auth/jwt/login')
	assert.ok(login, 'FastAPI resolves full path /api/v1/auth/jwt/login')
	assert.equal(login.method, 'POST')
	assert.equal(login.file, 'app/routers/auth.py')

	const refresh = profile.routes.find((r) => r.path === '/api/v1/auth/jwt/refresh')
	assert.ok(refresh, 'FastAPI resolves full path /api/v1/auth/jwt/refresh')

	// Nested router with root: /api/v1/users + / -> /api/v1/users
	const usersRoot = profile.routes.find((r) => r.path === '/api/v1/users' && r.file === 'app/routers/users.py')
	assert.ok(usersRoot, 'FastAPI resolves root / with prefix to /api/v1/users')

	const userDetail = profile.routes.find((r) => r.path === '/api/v1/users/{id}')
	assert.ok(userDetail, 'FastAPI resolves parameter route to /api/v1/users/{id}')

	// Check grouping by file
	assert.equal(Object.keys(profile.routesByFile).length, 3)
	assert.equal(profile.routesByFile['app/main.py'].length, 1)
	assert.equal(profile.routesByFile['app/routers/auth.py'].length, 2)
	assert.equal(profile.routesByFile['app/routers/users.py'].length, 2)
})

test('Phase 3: Express app.use("/base", router) mounts resolve full path and group by file', () => {
	const filesMap = new Map([
		[
			'server.js',
			{
				text: `
const express = require('express')
const authRouter = require('./routes/auth')
const app = express()

app.use('/base', authRouter)

app.get('/status', (req, res) => res.send('ok'))
`,
			},
		],
		[
			'routes/auth.js',
			{
				text: `
const express = require('express')
const router = express.Router()

router.post('/login', (req, res) => res.json({ token: 'abc' }))
router.get('/profile', (req, res) => res.json({ user: 'me' }))

module.exports = router
`,
			},
		],
	])

	const profile = extractProjectProfile({ filesMap })
	assert.equal(profile.routes.length, 3)

	const status = profile.routes.find((r) => r.path === '/status')
	assert.ok(status)

	const login = profile.routes.find((r) => r.path === '/base/login')
	assert.ok(login, 'Express resolves full path /base/login')
	assert.equal(login.method, 'POST')
	assert.equal(login.file, 'routes/auth.js')

	const userProfile = profile.routes.find((r) => r.path === '/base/profile')
	assert.ok(userProfile, 'Express resolves full path /base/profile')

	assert.equal(profile.routesByFile['routes/auth.js'].length, 2)
	assert.equal(profile.routesByFile['server.js'].length, 1)
})

test('Phase 3: Badge endpoint case-insensitive lookup, real grade, and "run an analysis first"', async () => {
	clearPreviousScans()
	clearGraphCache()

	// 1. When no scan exists yet: returns "run an analysis first"
	let capturedStatus = 200
	let capturedHeaders = {}
	let capturedBody = null

	const mockRes = () => ({
		status: (code) => {
			capturedStatus = code
			return capturedRes
		},
		setHeader: (k, v) => {
			capturedHeaders[k] = v
		},
		send: (b) => {
			capturedBody = b
			return capturedRes
		},
		json: (d) => {
			capturedBody = d
			return capturedRes
		},
	})
	let capturedRes = mockRes()

	const reqNoScan = {
		params: { owner: 'unscanned-org', repo: 'new-project' },
		headers: { accept: 'image/svg+xml' },
		protocol: 'https',
		get: (h) => (h === 'host' ? 'setupdoctor.dev' : ''),
	}

	await handleBadge(reqNoScan, capturedRes)
	assert.equal(capturedStatus, 200)
	assert.ok(capturedBody.includes('run an analysis first'), 'Badge SVG says "run an analysis first" when no scan')

	// JSON format check for no scan
	const reqNoScanJson = {
		params: { owner: 'unscanned-org', repo: 'new-project' },
		headers: { accept: 'application/json' },
		query: { format: 'json' },
		protocol: 'https',
		get: (h) => (h === 'host' ? 'setupdoctor.dev' : ''),
	}
	capturedRes = mockRes()
	await handleBadge(reqNoScanJson, capturedRes)
	assert.equal(capturedBody.message, 'run an analysis first')
	assert.equal(capturedBody.grade, 'unknown')

	// 2. When scan exists: case-insensitive lookup by owner/repo
	setPreviousScan('my-org', 'my-repo', {
		grade: 'B',
		score: 85,
	})

	const reqCaseInsensitive = {
		params: { owner: 'MY-ORG', repo: 'MY-REPO' },
		headers: { accept: 'image/svg+xml' },
		protocol: 'https',
		get: (h) => (h === 'host' ? 'setupdoctor.dev' : ''),
	}
	capturedRes = mockRes()
	await handleBadge(reqCaseInsensitive, capturedRes)
	assert.ok(capturedBody.includes('Grade B'), 'Badge SVG displays Grade B from case-insensitive match')

	// 3. README snippet uses PUBLIC_BASE_URL (fallback request host) and includes reachable disclaimer
	process.env.PUBLIC_BASE_URL = 'https://doctor.customdomain.org'
	const reqSnippet = {
		params: { owner: 'my-org', repo: 'my-repo' },
		headers: { accept: 'application/json' },
		protocol: 'http',
		get: (h) => (h === 'host' ? 'localhost:3000' : ''),
	}
	capturedRes = mockRes()
	await handleBadge(reqSnippet, capturedRes)
	assert.ok(
		capturedBody.markdown.includes('https://doctor.customdomain.org/api/badge/my-org/my-repo'),
		'Markdown snippet uses PUBLIC_BASE_URL'
	)
	assert.ok(
		capturedBody.markdown.includes('publicly reachable'),
		'Markdown snippet contains disclaimer about backend being publicly reachable'
	)

	delete process.env.PUBLIC_BASE_URL
})
