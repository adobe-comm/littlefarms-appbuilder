const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createRegularStore } = require('../../lib/regular-store')
const { WEEKDAY_NAMES } = require('../../lib/constants')
const { zonedParts, weekdayKeyFromLong } = require('../../lib/slot-builder')
const { DEFAULT_TIMEZONE } = require('../../lib/constants')
const { invalidateDeliverySlotCache } = require('../../lib/delivery-cache')

function yesterdayWeekdayKey (timeZone) {
  const now = new Date()
  const todayYmd = zonedParts(now, timeZone).ymd
  const yesterdayYmd = new Date(`${todayYmd}T00:00:00Z`)
  yesterdayYmd.setUTCDate(yesterdayYmd.getUTCDate() - 1)
  const probe = new Date(`${yesterdayYmd.toISOString().slice(0, 10)}T12:00:00Z`)
  return weekdayKeyFromLong(zonedParts(probe, timeZone).weekdayLong)
}

async function main (params) {
  const logger = Core.Logger('delivery-slot-reset', { level: params.LOG_LEVEL || 'info' })

  try {
    const timeZone = String(params.DELIVERY_SLOT_TIMEZONE || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE
    const storeViewCode = String(params.storeViewCode || params.MAGENTO_STORE_VIEW_CODE || 'default').trim() || 'default'
    const weekdayKey = yesterdayWeekdayKey(timeZone)
    if (!WEEKDAY_NAMES.includes(weekdayKey)) {
      return errorResponse(400, `Could not resolve weekday for reset (${weekdayKey}).`, logger)
    }

    const store = createRegularStore(params)
    const current = await store.get(storeViewCode)
    const weekdays = { ...current.weekdays }
    weekdays[weekdayKey] = (weekdays[weekdayKey] || []).map(row => ({
      ...row,
      bookedCount: 0
    }))
    const saved = await store.save(storeViewCode, weekdays)
    await invalidateDeliverySlotCache(params)
    logger.info(`Reset regular booked counts for ${weekdayKey} (${storeViewCode})`)
    return {
      statusCode: 200,
      body: {
        storeViewCode,
        weekdayKey,
        slotCount: saved.weekdays[weekdayKey]?.length || 0
      }
    }
  } catch (error) {
    logger.error(error.message || 'delivery-slot-reset failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
