const { COLLECTION_BOOKINGS } = require('./constants')
const { ensureCollection, openDeliveryDb, findOneOrNull, saveDocumentById } = require('./delivery-db')

function bookingDocumentId (orderId) {
  return String(orderId || '').trim()
}

function createBookingStore (params) {
  let dbPromise

  async function collection () {
    dbPromise ||= openDeliveryDb(params).then(async ({ client }) =>
      ensureCollection(client, COLLECTION_BOOKINGS)
    )
    return dbPromise
  }

  async function get (orderId) {
    const col = await collection()
    const key = bookingDocumentId(orderId)
    if (!key) return null
    return findOneOrNull(col, { id: key })
  }

  async function markBooked (orderId, meta) {
    const col = await collection()
    const key = bookingDocumentId(orderId)
    if (!key) {
      const error = new Error('orderId is required for booking idempotency.')
      error.statusCode = 400
      throw error
    }
    const existing = await findOneOrNull(col, { id: key })
    if (existing?.bookedAt) return { skipped: true, existing }
    const doc = {
      orderId: key,
      bookedAt: new Date().toISOString(),
      path: meta?.path || 'regular',
      deliveryDateTime: meta?.deliveryDateTime || '',
      deliveryDateTimeSlot: meta?.deliveryDateTimeSlot || ''
    }
    await saveDocumentById(col, key, doc)
    return { skipped: false, doc }
  }

  /** After My Orders reschedule — keep idempotency doc aligned with the order’s current slot. */
  async function setBookedMeta (orderId, meta) {
    const col = await collection()
    const key = bookingDocumentId(orderId)
    if (!key) return { skipped: true }
    const existing = await findOneOrNull(col, { id: key })
    const doc = {
      ...(existing || {}),
      id: key,
      orderId: key,
      bookedAt: existing?.bookedAt || new Date().toISOString(),
      path: meta?.path || 'regular',
      deliveryDateTime: meta?.deliveryDateTime || '',
      deliveryDateTimeSlot: meta?.deliveryDateTimeSlot || '',
      rescheduledAt: new Date().toISOString()
    }
    await saveDocumentById(col, key, doc)
    return { skipped: false, doc }
  }

  return {
    get,
    markBooked,
    setBookedMeta
  }
}

module.exports = {
  createBookingStore
}
