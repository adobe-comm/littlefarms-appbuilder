const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createLocationStore } = require('../../lib/location-store')
const { invalidateLocationStorefrontCache } = require('../../lib/invalidate-location-cache')

async function main (params) {
  const logger = Core.Logger('location-mass', { level: params.LOG_LEVEL || 'info' })

  try {
    const operation = String(params.operation || '').trim()
    const store = createLocationStore(params)
    const result = await store.applyMass(operation, params.ids)
    if (result.affected > 0) await invalidateLocationStorefrontCache(params)
    logger.info(`Location mass ${operation} affected ${result.affected}`)
    return { statusCode: 200, body: { operation, affected: result.affected } }
  } catch (error) {
    logger.error(error.message || 'Location mass action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
