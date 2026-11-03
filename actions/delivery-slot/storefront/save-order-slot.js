const { errorResponse } = require('../../utils')
const { createRegularStore } = require('../lib/regular-store')
const { createSpecialStore } = require('../lib/special-store')
const { createBookingStore } = require('../lib/booking-store')
const { rescheduleOrderBooking } = require('../lib/booking')
const {
  loadOrderDeliverySlotByIncrementId,
  updateOrderDeliveryCustomAttributes
} = require('../lib/commerce-order-rest')
const { invalidateDeliverySlotCache } = require('../lib/delivery-cache')

async function saveOrderDeliverySlot (params, logger) {
  const orderNumber = String(params.orderNumber || '').trim()
  if (!orderNumber) {
    return errorResponse(400, 'orderNumber is required for save-order-delivery-slot.', logger)
  }

  const deliveryDateTime = String(params.deliveryDateTime || '').trim()
  const deliveryDateTimeSlot = String(params.deliveryDateTimeSlot || '').trim()
  if (!deliveryDateTime || !deliveryDateTimeSlot) {
    return errorResponse(
      400,
      'deliveryDateTime and deliveryDateTimeSlot are required for save-order-delivery-slot.',
      logger
    )
  }

  const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
  const path = String(params.deliverySlotPath || 'regular').trim() || 'regular'

  const previous = await loadOrderDeliverySlotByIncrementId(params, orderNumber)
  if (!previous?.deliveryDateTime) {
    return errorResponse(
      404,
      'Order has no delivery_date_time in Commerce custom_attributes (REST GET by increment_id).',
      logger
    )
  }

  const bookingResult = await rescheduleOrderBooking({
    params,
    regularStore: createRegularStore(params),
    specialStore: createSpecialStore(params),
    oldMeta: { storeViewCode, ...previous },
    newMeta: { storeViewCode, deliveryDateTime, deliveryDateTimeSlot, path }
  })

  if (bookingResult.skipped) {
    return {
      statusCode: 200,
      body: {
        success: true,
        orderNumber,
        storeViewCode,
        skipped: true,
        reason: bookingResult.reason || 'unchanged',
        bookingApplied: false
      }
    }
  }

  if (!bookingResult.applied) {
    return errorResponse(
      bookingResult.reason === 'slot_full' ? 409 : 422,
      `Could not update slot booking: ${bookingResult.reason || 'unknown'}.`,
      logger
    )
  }

  await updateOrderDeliveryCustomAttributes(params, previous.entityId, {
    deliveryDateTime,
    deliveryDateTimeSlot,
    path
  })

  await createBookingStore(params).setBookedMeta(orderNumber, {
    path: bookingResult.newPath || path,
    deliveryDateTime,
    deliveryDateTimeSlot
  })
  await invalidateDeliverySlotCache(params)

  logger.info(`Order ${orderNumber} delivery slot booking adjusted: ${JSON.stringify(bookingResult)}`)
  return {
    statusCode: 200,
    body: {
      success: true,
      orderNumber,
      storeViewCode,
      bookingApplied: true,
      commerceUpdated: true,
      released: bookingResult.released === true,
      path: bookingResult.newPath || path,
      previous: {
        deliveryDateTime: previous.deliveryDateTime,
        deliveryDateTimeSlot: previous.deliveryDateTimeSlot,
        path: previous.path
      }
    }
  }
}

module.exports = {
  saveOrderDeliverySlot
}
