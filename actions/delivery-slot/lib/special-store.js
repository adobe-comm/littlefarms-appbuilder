const { COLLECTION_SPECIAL, WEEKDAY_NAMES } = require('./constants')
const { ensureCollection, openDeliveryDb, findOneOrNull, saveDocumentById } = require('./delivery-db')
const { scopeFromParams, documentId } = require('./scope')
const { normalizeSlotRow } = require('./regular-store')

function parseBookedMap (value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeSpecialSlotRow (row) {
  const base = normalizeSlotRow(row)
  if (!base) return null
  return {
    ...base,
    bookedByDate: parseBookedMap(row.bookedByDate ?? row.booked_count)
  }
}

function emptyWeekdays () {
  const weekdays = {}
  for (const day of WEEKDAY_NAMES) weekdays[day] = []
  return weekdays
}

function normalizeWeekdays (weekdays) {
  const out = emptyWeekdays()
  if (!weekdays || typeof weekdays !== 'object') return out
  for (const day of WEEKDAY_NAMES) {
    const rows = Array.isArray(weekdays[day]) ? weekdays[day] : []
    out[day] = rows.map(normalizeSpecialSlotRow).filter(Boolean)
  }
  return out
}

function createSpecialStore (params) {
  let dbPromise

  async function collection () {
    dbPromise ||= openDeliveryDb(params).then(async ({ client }) =>
      ensureCollection(client, COLLECTION_SPECIAL)
    )
    return dbPromise
  }

  async function get (storeViewCode) {
    const scope = scopeFromParams({ ...params, storeViewCode })
    const col = await collection()
    const doc = await findOneOrNull(col, { id: documentId(scope) })
    if (!doc) {
      return {
        storeViewCode: scope.storeViewCode,
        environmentId: scope.environmentId,
        enabled: false,
        orderStartDate: '',
        orderEndDate: '',
        categoryOffsets: [],
        weekdays: emptyWeekdays(),
        updatedAt: null
      }
    }
    return {
      storeViewCode: doc.storeViewCode || scope.storeViewCode,
      environmentId: doc.environmentId || scope.environmentId,
      enabled: Boolean(doc.enabled),
      orderStartDate: String(doc.orderStartDate || '').trim(),
      orderEndDate: String(doc.orderEndDate || '').trim(),
      categoryOffsets: Array.isArray(doc.categoryOffsets) ? doc.categoryOffsets : [],
      weekdays: normalizeWeekdays(doc.weekdays),
      updatedAt: doc.updatedAt || null
    }
  }

  async function save (storeViewCode, payload) {
    const scope = scopeFromParams({ ...params, storeViewCode })
    const col = await collection()
    const updatedAt = new Date().toISOString()
    const doc = {
      storeViewCode: scope.storeViewCode,
      environmentId: scope.environmentId,
      enabled: Boolean(payload.enabled),
      orderStartDate: String(payload.orderStartDate || '').trim(),
      orderEndDate: String(payload.orderEndDate || '').trim(),
      categoryOffsets: Array.isArray(payload.categoryOffsets) ? payload.categoryOffsets : [],
      weekdays: normalizeWeekdays(payload.weekdays),
      updatedAt
    }
    return saveDocumentById(col, documentId(scope), doc)
  }

  function isOrderWindowActive (config, ymd) {
    if (!config.enabled) return false
    if (!config.orderStartDate || !config.orderEndDate) return false
    return ymd >= config.orderStartDate && ymd <= config.orderEndDate
  }

  function maxDeliveryOffsetForCart (config, categoryIds) {
    const ids = new Set((categoryIds || []).map(id => String(id)))
    let max = 0
    for (const row of config.categoryOffsets || []) {
      if (ids.has(String(row.categoryId))) {
        max = Math.max(max, Number(row.offsetDays) || 0)
      }
    }
    return max
  }

  return {
    get,
    save,
    isOrderWindowActive,
    maxDeliveryOffsetForCart,
    normalizeWeekdays
  }
}

module.exports = {
  createSpecialStore,
  parseBookedMap
}
