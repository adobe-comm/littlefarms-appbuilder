const { COLLECTION_REGULAR, WEEKDAY_NAMES } = require('./constants')
const { ensureCollection, openDeliveryDb, findOneOrNull, saveDocumentById } = require('./delivery-db')
const { scopeFromParams, documentId } = require('./scope')

function emptyWeekdays () {
  const weekdays = {}
  for (const day of WEEKDAY_NAMES) weekdays[day] = []
  return weekdays
}

function normalizeSlotRow (row) {
  if (!row || typeof row !== 'object') return null
  const startTime = String(row.startTime ?? row.start_time ?? '').trim()
  const endTime = String(row.endTime ?? row.end_time ?? '').trim()
  const maxUser = Math.max(0, Number(row.maxUser ?? row.max_user ?? 0))
  const bookedCount = Math.max(0, Number(row.bookedCount ?? row.booked_count ?? 0))
  if (!startTime || !endTime) return null
  return { startTime, endTime, maxUser, bookedCount }
}

function normalizeWeekdays (weekdays) {
  const out = emptyWeekdays()
  if (!weekdays || typeof weekdays !== 'object') return out
  for (const day of WEEKDAY_NAMES) {
    const rows = Array.isArray(weekdays[day]) ? weekdays[day] : []
    out[day] = rows.map(normalizeSlotRow).filter(Boolean)
  }
  return out
}

function createRegularStore (params) {
  let dbPromise

  async function collection () {
    dbPromise ||= openDeliveryDb(params).then(async ({ client }) =>
      ensureCollection(client, COLLECTION_REGULAR)
    )
    return dbPromise
  }

  async function get (storeViewCode) {
    const scope = scopeFromParams({ ...params, storeViewCode })
    const col = await collection()
    const doc = await findOneOrNull(col, { id: documentId(scope) })
    if (!doc?.weekdays) {
      return {
        storeViewCode: scope.storeViewCode,
        environmentId: scope.environmentId,
        weekdays: emptyWeekdays(),
        updatedAt: null
      }
    }
    return {
      storeViewCode: doc.storeViewCode || scope.storeViewCode,
      environmentId: doc.environmentId || scope.environmentId,
      weekdays: normalizeWeekdays(doc.weekdays),
      updatedAt: doc.updatedAt || null
    }
  }

  async function save (storeViewCode, weekdays) {
    const scope = scopeFromParams({ ...params, storeViewCode })
    const col = await collection()
    const normalized = normalizeWeekdays(weekdays)
    for (const day of WEEKDAY_NAMES) {
      for (const row of normalized[day]) {
        row.bookedCount = Math.max(0, Number(row.bookedCount) || 0)
      }
    }
    const updatedAt = new Date().toISOString()
    const payload = {
      storeViewCode: scope.storeViewCode,
      environmentId: scope.environmentId,
      weekdays: normalized,
      updatedAt
    }
    return saveDocumentById(col, documentId(scope), payload)
  }

  async function updateWeekdayBooked (storeViewCode, weekdayKey, delta) {
    const current = await get(storeViewCode)
    const rows = current.weekdays[weekdayKey]
    if (!Array.isArray(rows) || !rows.length) return current
    const updated = { ...current.weekdays }
    updated[weekdayKey] = rows.map(row => ({
      ...row,
      bookedCount: Math.max(0, Number(row.bookedCount) + delta)
    }))
    return save(storeViewCode, updated)
  }

  return {
    get,
    save,
    updateWeekdayBooked,
    normalizeWeekdays,
    emptyWeekdays
  }
}

module.exports = {
  createRegularStore,
  normalizeSlotRow
}
