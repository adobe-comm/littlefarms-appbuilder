const { weekdayKeyFromLong, zonedParts } = require('./slot-builder')
const { DEFAULT_TIMEZONE } = require('./constants')

function parseDeliveryDateTime (value) {
  const raw = String(value || '').trim()
  if (!raw) return { ymd: '', hm: '' }
  const ymd = raw.slice(0, 10)
  let hm = ''
  if (raw.includes(' ')) hm = raw.split(' ')[1]?.slice(0, 5) || ''
  return { ymd, hm: normalizeHm(hm) }
}

/** Legacy Config.php minusDeliverySlotMax: match row where start_time equals order H:i */
function normalizeHm (value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const parts = s.split(':')
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  }
  return s.length >= 5 ? s.slice(0, 5) : s
}

function slotRowMatches (row, startHm, slotLabel) {
  const rowStart = normalizeHm(row.startTime ?? row.start_time)
  if (startHm && rowStart && rowStart === startHm) return true
  const label = String(slotLabel || '').trim()
  if (!label || !rowStart) return false
  const rowEnd = normalizeHm(row.endTime ?? row.end_time)
  const compactLabel = label.replace(/\s/g, '')
  const range = rowEnd ? `${rowStart}-${rowEnd}` : rowStart
  if (compactLabel === range || label.includes(rowStart)) return true
  return false
}

function slotSelectionKey (meta) {
  if (!meta?.deliveryDateTime) return ''
  const { ymd, hm } = parseDeliveryDateTime(meta.deliveryDateTime)
  const slot = String(meta.deliveryDateTimeSlot || '').trim()
  const path = String(meta.path || 'regular').trim() || 'regular'
  return `${path}|${ymd}|${hm}|${slot}`
}

function slotsEqual (a, b) {
  if (!a?.deliveryDateTime || !b?.deliveryDateTime) return false
  return slotSelectionKey(a) === slotSelectionKey(b)
}

function weekdayKeyForDelivery (deliveryDateTime, tz) {
  const { ymd } = parseDeliveryDateTime(deliveryDateTime)
  if (!ymd) return ''
  const probe = new Date(`${ymd}T12:00:00Z`)
  return weekdayKeyFromLong(zonedParts(probe, tz).weekdayLong)
}

function applyDeltaToRegularWeekdays (weekdays, deliveryDateTime, deliveryDateTimeSlot, delta, tz) {
  const { ymd, hm } = parseDeliveryDateTime(deliveryDateTime)
  if (!ymd) return { weekdays, matched: false, weekdayKey: '', ymd, hm }
  const weekdayKey = weekdayKeyForDelivery(deliveryDateTime, tz)
  const rows = weekdays[weekdayKey] || []
  let matched = false
  const updated = { ...weekdays }
  updated[weekdayKey] = rows.map(row => {
    if (!slotRowMatches(row, hm, deliveryDateTimeSlot)) return row
    matched = true
    const next = (Number(row.bookedCount) || 0) + delta
    if (delta > 0) {
      const max = Number(row.maxUser ?? row.max_user) || 0
      if (max > 0 && next > max) {
        const error = new Error('Selected slot has no remaining capacity.')
        error.statusCode = 409
        error.code = 'slot_full'
        throw error
      }
    }
    return {
      ...row,
      bookedCount: Math.max(0, next)
    }
  })
  return { weekdays: updated, matched, weekdayKey, ymd, hm }
}

function applyDeltaToSpecialWeekdays (weekdays, deliveryDateTime, deliveryDateTimeSlot, delta, tz) {
  const { ymd, hm } = parseDeliveryDateTime(deliveryDateTime)
  if (!ymd) return { weekdays, matched: false, weekdayKey: '', ymd, hm }
  const weekdayKey = weekdayKeyForDelivery(deliveryDateTime, tz)
  const rows = weekdays[weekdayKey] || []
  let matched = false
  const updated = { ...weekdays }
  updated[weekdayKey] = rows.map(row => {
    if (!slotRowMatches(row, hm, deliveryDateTimeSlot)) return row
    matched = true
    const map = { ...(row.bookedByDate || {}) }
    const next = Math.max(0, (Number(map[ymd]) || 0) + delta)
    if (delta > 0) {
      const max = Number(row.maxUser ?? row.max_user) || 0
      if (max > 0 && next > max) {
        const error = new Error('Selected slot has no remaining capacity.')
        error.statusCode = 409
        error.code = 'slot_full'
        throw error
      }
    }
    map[ymd] = next
    return { ...row, bookedByDate: map }
  })
  return { weekdays: updated, matched, weekdayKey, ymd, hm }
}

async function applyPathDelta ({
  store,
  storeViewCode,
  path,
  deliveryDateTime,
  deliveryDateTimeSlot,
  delta,
  tz
}) {
  const config = await store.get(storeViewCode)
  const applyFn = path === 'special' ? applyDeltaToSpecialWeekdays : applyDeltaToRegularWeekdays
  const result = applyFn(config.weekdays, deliveryDateTime, deliveryDateTimeSlot, delta, tz)
  if (delta !== 0 && !result.matched) {
    return { saved: false, reason: 'no_matching_slot', path, ...result }
  }
  const savePayload = path === 'special'
    ? { ...config, weekdays: result.weekdays }
    : result.weekdays
  await store.save(storeViewCode, savePayload)
  return { saved: true, path, ...result }
}

async function applyOrderBooking ({
  params,
  regularStore,
  specialStore,
  orderMeta
}) {
  const storeViewCode = String(orderMeta.storeViewCode || params.MAGENTO_STORE_VIEW_CODE || 'default')
  const deliveryDateTime = orderMeta.deliveryDateTime
  const deliveryDateTimeSlot = orderMeta.deliveryDateTimeSlot || ''
  const path = orderMeta.path || 'regular'
  if (!deliveryDateTime) return { applied: false, reason: 'no_delivery_fields' }

  const tz = String(params.DELIVERY_SLOT_TIMEZONE || DEFAULT_TIMEZONE)
  const store = path === 'special' ? specialStore : regularStore
  const result = await applyPathDelta({
    store,
    storeViewCode,
    path,
    deliveryDateTime,
    deliveryDateTimeSlot,
    delta: 1,
    tz
  })
  if (!result.saved) return { applied: false, reason: result.reason }
  return {
    applied: true,
    path,
    ymd: result.ymd,
    weekdayKey: result.weekdayKey,
    startTime: result.hm
  }
}

/**
 * My Orders reschedule: release old slot (−1) then book new slot (+1).
 * Validates capacity on +1 after in-memory −1 when old and new share the same path store.
 */
async function rescheduleOrderBooking ({
  params,
  regularStore,
  specialStore,
  oldMeta,
  newMeta
}) {
  const storeViewCode = String(
    newMeta.storeViewCode || oldMeta?.storeViewCode || params.MAGENTO_STORE_VIEW_CODE || 'default'
  )
  const tz = String(params.DELIVERY_SLOT_TIMEZONE || DEFAULT_TIMEZONE)

  if (slotsEqual(oldMeta, newMeta)) {
    return { applied: false, skipped: true, reason: 'unchanged' }
  }

  const oldPath = String(oldMeta?.path || 'regular').trim() || 'regular'
  const newPath = String(newMeta.path || 'regular').trim() || 'regular'
  let released = false

  if (oldMeta?.deliveryDateTime) {
    const oldStore = oldPath === 'special' ? specialStore : regularStore
    const release = await applyPathDelta({
      store: oldStore,
      storeViewCode,
      path: oldPath,
      deliveryDateTime: oldMeta.deliveryDateTime,
      deliveryDateTimeSlot: oldMeta.deliveryDateTimeSlot,
      delta: -1,
      tz
    })
    released = release.saved && release.matched
  }

  const newStore = newPath === 'special' ? specialStore : regularStore
  const book = await applyPathDelta({
    store: newStore,
    storeViewCode,
    path: newPath,
    deliveryDateTime: newMeta.deliveryDateTime,
    deliveryDateTimeSlot: newMeta.deliveryDateTimeSlot,
    delta: 1,
    tz
  })
  if (!book.saved || !book.matched) {
    return {
      applied: false,
      reason: book.reason || 'no_matching_slot',
      released
    }
  }

  return {
    applied: true,
    released,
    oldPath,
    newPath,
    ymd: book.ymd,
    weekdayKey: book.weekdayKey,
    startTime: book.hm
  }
}

module.exports = {
  applyOrderBooking,
  rescheduleOrderBooking
}
