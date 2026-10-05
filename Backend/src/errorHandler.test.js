const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const errorHandler = require('./middleware/errorHandler')

test('errorHandler: returns status and message from err.status', () => {
	let capturedStatus = null
	let capturedJson = null

	const res = {
		status(code) {
			capturedStatus = code
			return this
		},
		json(data) {
			capturedJson = data
			return this
		},
	}

	const err = new Error('Rate limit exceeded')
	err.status = 429

	errorHandler(err, {}, res, () => {})

	assert.equal(capturedStatus, 429)
	assert.deepEqual(capturedJson, {
		success: false,
		message: 'Rate limit exceeded',
	})
})

test('errorHandler: respects err.statusCode when status is not present', () => {
	let capturedStatus = null
	let capturedJson = null

	const res = {
		status(code) {
			capturedStatus = code
			return this
		},
		json(data) {
			capturedJson = data
			return this
		},
	}

	const err = new Error('Resource not found')
	err.statusCode = 404

	errorHandler(err, {}, res, () => {})

	assert.equal(capturedStatus, 404)
	assert.deepEqual(capturedJson, {
		success: false,
		message: 'Resource not found',
	})
})

test('errorHandler: defaults to status 500 and internal server error message', () => {
	let capturedStatus = null
	let capturedJson = null

	const res = {
		status(code) {
			capturedStatus = code
			return this
		},
		json(data) {
			capturedJson = data
			return this
		},
	}

	const err = {}

	errorHandler(err, {}, res, () => {})

	assert.equal(capturedStatus, 500)
	assert.deepEqual(capturedJson, {
		success: false,
		message: 'Internal server error',
	})
})

test('errorHandler: integrates with Express pipeline', async () => {
	const app = express()
	app.get('/error-test', (req, res, next) => {
		const error = new Error('Custom error')
		error.status = 418
		next(error)
	})
	app.use(errorHandler)

	const server = app.listen(0)
	const { port } = server.address()

	try {
		const res = await fetch(`http://127.0.0.1:${port}/error-test`)
		assert.equal(res.status, 418)
		const data = await res.json()
		assert.deepEqual(data, {
			success: false,
			message: 'Custom error',
		})
	} finally {
		server.close()
	}
})
