const { redactToken } = require('../services/github')

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
	const status = typeof err.status === 'number'
		? err.status
		: typeof err.statusCode === 'number'
		? err.statusCode
		: 500

	let message = err.message || 'Internal server error'
	message = redactToken(message)

	res.status(status).json({
		success: false,
		message,
	})
}

module.exports = errorHandler
