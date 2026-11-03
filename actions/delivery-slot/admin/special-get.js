const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { createSpecialStore } = require('../lib/special-store')

async function main (params) {
  const logger = Core.Logger('delivery-slot-admin', { level: params.LOG_LEVEL || 'info' })
  try {
    const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
    const store = createSpecialStore(params)
    const config = await store.get(storeViewCode)
    logger.info(`Special delivery config loaded for ${storeViewCode}`)
    return { statusCode: 200, body: config }
  } catch (error) {
    logger.error(error.message || 'special-get failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

module.exports = { main }
