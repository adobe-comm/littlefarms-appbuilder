const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createBookingStore } = require('../../lib/booking-store')
const { createRegularStore } = require('../../lib/regular-store')
const { createSpecialStore } = require('../../lib/special-store')
const { applyOrderBooking } = require('../../lib/booking')
const { invalidateDeliverySlotCache } = require('../../lib/delivery-cache')

function eventPayloadRoot (params) {
  if (params.__ow_body) {
    try {
      return JSON.parse(Buffer.from(params.__ow_body, 'base64').toString('utf8'))
    } catch {
      return params
    }
  }
  return params
}

/** Order row from CloudEvents (data.value) or legacy flat payloads — not the CloudEvents envelope id. */
function orderEntityFromEvent (params) {
  const root = eventPayloadRoot(params)
  const data = root?.data
  if (data && typeof data === 'object' && data.value && typeof data.value === 'object') {
    return data.value
  }
  if (data && typeof data === 'object' && (data.increment_id || data.id)) {
    return data
  }
  if (root?.event && typeof root.event === 'object') {
    return root.event
  }
  if (params.increment_id || params.id || params.custom_attributes) {
    return params
  }
  return null
}

/** Idempotency key + Commerce GraphQL order number (increment id preferred). */
function orderRefsFromEvent (params) {
  const order = orderEntityFromEvent(params)
  if (!order) return { orderKey: '', orderNumber: '' }
  const incrementId = String(order.increment_id || order.incrementId || '').trim()
  const entityId = String(order.id || order.entity_id || order.order_id || order.orderId || '').trim()
  const orderKey = incrementId || entityId
  const orderNumber = incrementId || entityId
  return { orderKey, orderNumber }
}

function customAttributesArrayToMap (items) {
  const map = {}
  for (const row of items || []) {
    if (row?.attribute_code != null) map[String(row.attribute_code)] = row.value
  }
  return map
}

function customAttributesToMap (raw) {
  if (!raw) return {}
  if (Array.isArray(raw)) return customAttributesArrayToMap(raw)
  if (typeof raw !== 'object') return {}
  const map = {}
  for (const [key, entry] of Object.entries(raw)) {
    if (entry && typeof entry === 'object' && entry.attribute_code != null) {
      map[String(entry.attribute_code)] = entry.value
    } else if (entry != null && typeof entry !== 'object') {
      map[key] = entry
    }
  }
  return map
}

function deliveryFieldsFromEvent (params) {
  const order = orderEntityFromEvent(params)
  if (!order) return null
  const attrs = customAttributesToMap(order.custom_attributes)
  if (!attrs.delivery_date_time) return null
  return {
    deliveryDateTime: String(attrs.delivery_date_time || '').trim(),
    deliveryDateTimeSlot: String(attrs.delivery_date_time_slot || '').trim(),
    path: String(attrs.delivery_slot_path || 'regular').trim() || 'regular'
  }
}

async function main (params) {
  const logger = Core.Logger('delivery-slot-order-book', { level: params.LOG_LEVEL || 'info' })

  try {
    const { orderKey, orderNumber } = orderRefsFromEvent(params)
    if (!orderKey) {
      return errorResponse(400, 'Order id or increment_id not found in event payload.', logger)
    }

    const bookings = createBookingStore(params)
    const existing = await bookings.get(orderKey)
    if (existing?.bookedAt) {
      logger.info(`Order ${orderKey} already booked — skipping.`)
      return { statusCode: 200, body: { skipped: true, orderId: orderKey } }
    }

    const fields = deliveryFieldsFromEvent(params)
    if (!fields?.deliveryDateTime) {
      logger.info(`Order ${orderKey} has no delivery_date_time — no booking applied.`)
      return { statusCode: 200, body: { skipped: true, orderId: orderKey, reason: 'no_delivery_fields' } }
    }

    const regularStore = createRegularStore(params)
    const specialStore = createSpecialStore(params)
    const result = await applyOrderBooking({
      params,
      regularStore,
      specialStore,
      orderMeta: {
        storeViewCode: params.storeViewCode,
        deliveryDateTime: fields.deliveryDateTime,
        deliveryDateTimeSlot: fields.deliveryDateTimeSlot,
        path: fields.path
      }
    })

    if (result.applied) {
      await bookings.markBooked(orderKey, {
        path: result.path,
        deliveryDateTime: fields.deliveryDateTime,
        deliveryDateTimeSlot: fields.deliveryDateTimeSlot
      })
    }
    await invalidateDeliverySlotCache(params)
    logger.info(`Order ${orderKey} booking result: ${JSON.stringify(result)}`)
    return { statusCode: 200, body: { orderId: orderKey, orderNumber, ...result } }
  } catch (error) {
    logger.error(error.message || 'delivery-slot-order-book failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
