const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { createRegularStore } = require('../lib/regular-store')

async function main (params) {
  const logger = Core.Logger('delivery-slot-admin', { level: params.LOG_LEVEL || 'info' })
  try {
    const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
    const store = createRegularStore(params)
    const config = await store.get(storeViewCode)
    logger.info(`Regular delivery config loaded for ${storeViewCode}`)
    return { statusCode: 200, body: config }
  } catch (error) {
    logger.error(error.message || 'regular-get failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

module.exports = { main }
