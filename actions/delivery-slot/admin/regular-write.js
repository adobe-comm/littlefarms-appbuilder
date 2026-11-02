const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { createRegularStore } = require('../lib/regular-store')
const { invalidateDeliverySlotCache } = require('../lib/delivery-cache')

function validateWeekdays (weekdays) {
  if (!weekdays || typeof weekdays !== 'object') {
    const error = new Error('weekdays object is required.')
    error.statusCode = 400
    throw error
  }
}

async function main (params) {
  const logger = Core.Logger('delivery-slot-admin', { level: params.LOG_LEVEL || 'info' })
  try {
    const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
    validateWeekdays(params.weekdays)
    const store = createRegularStore(params)
    const current = await store.get(storeViewCode)
    const incoming = store.normalizeWeekdays(params.weekdays)
    for (const day of Object.keys(incoming)) {
      incoming[day] = incoming[day].map((row, index) => {
        const prev = (current.weekdays[day] || [])[index]
        return {
          ...row,
          bookedCount: prev ? prev.bookedCount : 0
        }
      })
    }
    const saved = await store.save(storeViewCode, incoming)
    await invalidateDeliverySlotCache(params)
    logger.info(`Regular delivery config saved for ${storeViewCode}`)
    return { statusCode: 200, body: saved }
  } catch (error) {
    logger.error(error.message || 'regular-write failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

module.exports = { main }
