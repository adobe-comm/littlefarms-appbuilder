const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../utils')

/**
 * Dispatch Runtime requests by `params.operation` to handler modules that export `main`.
 *
 * @param {object} options
 * @param {string} options.logName Logger name for unknown-operation errors
 * @param {Record<string, { main: Function }>} options.handlers
 * @param {string} [options.defaultOperation]
 */
function createOperationRouter ({ logName, handlers, defaultOperation }) {
  const allowed = Object.keys(handlers).sort()

  return async function main (params) {
    const logger = Core.Logger(logName, { level: params.LOG_LEVEL || 'info' })
    const operation = String(
      params.adminOperation || params.operation || defaultOperation || ''
    ).trim().toLowerCase()
    const handler = handlers[operation]
    if (!handler?.main) {
      return errorResponse(
        400,
        `operation must be one of: ${allowed.join(', ')}.`,
        logger
      )
    }
    return handler.main(params)
  }
}

module.exports = { createOperationRouter }
