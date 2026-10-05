const app = require('./app')

const port = process.env.PORT || 5000

if (require.main === module) {
	app.listen(port, () => {
		console.log(`SetupDoctor backend listening on port ${port}`)
	})
}

module.exports = app
module.exports.app = app
