const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createContentStore } = require('../../lib/content-store')

async function main (params) {
  const logger = Core.Logger('location-content-mass', { level: params.LOG_LEVEL || 'info' })

  try {
    const kind = String(params.kind || '').trim()
    const operation = String(params.operation || '').trim().toLowerCase()
    const ids = params.ids
    const store = createContentStore(params)

    if (operation === 'delete') {
      const affected = await store.remove(kind, ids)
      logger.info(`Deleted ${affected} location ${kind} record(s)`)
      return { statusCode: 200, body: { affected } }
    }

    return errorResponse(400, 'operation must be delete.', logger)
  } catch (error) {
    logger.error(error.message || 'Location content mass action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
