/**
 * Shared test utilities for keeping the Node event loop alive during tests that wait on timeouts,
 * ensuring the Node.js test runner does not exit prematurely with cancelledByParent.
 */
function keepAlive(ms = 5000) {
	const timer = setTimeout(() => {}, ms)
	if (typeof timer.ref === 'function') {
		timer.ref()
	}
	return () => {
		clearTimeout(timer)
	}
}

module.exports = {
	keepAlive,
}
