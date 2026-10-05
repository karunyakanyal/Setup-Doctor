const cors = require('cors')
const dotenv = require('dotenv')
const express = require('express')
const { rateLimit } = require('express-rate-limit')
const helmet = require('helmet')

const analyzeRouter = require('./routes/analyze')
const repositoryRouter = require('./routes/repository')
const errorHandler = require('./middleware/errorHandler')

dotenv.config()

const app = express()

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const configuredOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
	: []
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultAllowedOrigins

app.use(helmet())
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '100kb' }))

const limiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 60,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res, next) => {
		const error = new Error('Too many requests, please try again later.')
		error.status = 429
		next(error)
	},
})
app.use(limiter)

app.get('/api/health', (req, res) => {
	res.json({
		status: 'ok',
		message: 'SetupDoctor backend is running',
	})
})

app.use('/api/analyze', analyzeRouter)
app.use('/api/repository', repositoryRouter)

app.use(errorHandler)

module.exports = app
module.exports.app = app
