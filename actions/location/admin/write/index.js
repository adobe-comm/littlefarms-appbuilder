const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createLocationStore } = require('../../lib/location-store')

async function main (params) {
  const logger = Core.Logger('location-write', { level: params.LOG_LEVEL || 'info' })

  try {
    const fields = params.fields && typeof params.fields === 'object' ? params.fields : {}
    const store = createLocationStore(params)
    const location = await store.save(fields, params.locationId)
    logger.info(`Saved location ${location.locationId}`)
    return { statusCode: 200, body: { location } }
  } catch (error) {
    logger.error(error.message || 'Location save failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
