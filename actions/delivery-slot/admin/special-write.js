const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { createSpecialStore } = require('../lib/special-store')
const { invalidateDeliverySlotCache } = require('../lib/delivery-cache')

async function main (params) {
  const logger = Core.Logger('delivery-slot-admin', { level: params.LOG_LEVEL || 'info' })
  try {
    const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
    const store = createSpecialStore(params)
    const current = await store.get(storeViewCode)
    const weekdays = store.normalizeWeekdays(params.weekdays || current.weekdays)
    for (const day of Object.keys(weekdays)) {
      weekdays[day] = weekdays[day].map((row, index) => {
        const prev = (current.weekdays[day] || [])[index]
        return {
          ...row,
          bookedByDate:
            row.bookedByDate != null ? row.bookedByDate : (prev?.bookedByDate || {})
        }
      })
    }
    const saved = await store.save(storeViewCode, {
      enabled: params.enabled != null ? params.enabled : current.enabled,
      orderStartDate: params.orderStartDate != null ? params.orderStartDate : current.orderStartDate,
      orderEndDate: params.orderEndDate != null ? params.orderEndDate : current.orderEndDate,
      categoryOffsets: params.categoryOffsets != null ? params.categoryOffsets : current.categoryOffsets,
      weekdays
    })
    await invalidateDeliverySlotCache(params)
    logger.info(`Special delivery config saved for ${storeViewCode}`)
    return { statusCode: 200, body: saved }
  } catch (error) {
    logger.error(error.message || 'special-write failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

module.exports = { main }
