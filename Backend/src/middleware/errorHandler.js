const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
	const status = typeof err.status === 'number'
		? err.status
		: typeof err.statusCode === 'number'
		? err.statusCode
		: 500

	const message = err.message || 'Internal server error'

	res.status(status).json({
		success: false,
		message,
	})
}

module.exports = errorHandler
