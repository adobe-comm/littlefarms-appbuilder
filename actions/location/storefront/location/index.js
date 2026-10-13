const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createLocationStore } = require('../../lib/location-store')
const { createLocationCache } = require('../../lib/location-cache')

function isWarmPing (params) {
  if (params.warm === true || params.warm === 'true') return true
  const payload = params.trigger_payload
  if (!payload) return false
  if (typeof payload === 'object') return payload.warm === true || payload.warm === 'true'
  try {
    const parsed = JSON.parse(payload)
    return parsed.warm === true || parsed.warm === 'true'
  } catch {
    return false
  }
}

function lookupFrom (params) {
  const locationId = String(params.locationId ?? '').trim()
  const title = String(params.title || '').trim()
  const storeUrl = String(params.storeUrl || '').trim()
  const count = [locationId, title, storeUrl].filter(Boolean).length
  return { locationId, title, storeUrl, count }
}

function optionalBoolean (value) {
  if (value == null || value === '') return undefined
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  const error = new Error('isFeatured must be true or false.')
  error.statusCode = 400
  throw error
}

function filtersFrom (params) {
  return {
    country: params.country,
    city: params.city,
    title: params.title,
    isFeatured: optionalBoolean(params.isFeatured)
  }
}

async function main (params) {
  const logger = Core.Logger('location-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    if (isWarmPing(params)) {
      return { statusCode: 200, body: { message: 'action is live' } }
    }

    const operation = String(params.operation || '').trim().toLowerCase()
    const store = createLocationStore(params)

    if (operation === 'get') {
      const lookup = lookupFrom(params)
      if (lookup.count !== 1) {
        return errorResponse(400, 'Provide exactly one of locationId, title, or storeUrl.', logger)
      }
      const location = await store.getStorefront({
        locationId: lookup.locationId,
        title: lookup.title,
        storeUrl: lookup.storeUrl
      })
      if (!location) return errorResponse(404, 'Location not found.', logger)
      return { statusCode: 200, body: { location } }
    }

    if (operation === 'directory') {
      const cache = await createLocationCache(params)
      const cached = await cache.getDirectory()
      if (cached) return { statusCode: 200, body: cached }

      const body = await store.listDirectoryGeneral()
      await cache.putDirectory(body)
      logger.info(`Stored location directory (${body.total} enabled)`)
      return { statusCode: 200, body }
    }

    if (operation === 'list') {
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 50))
      const body = await store.listStorefront({
        page,
        pageSize,
        filters: filtersFrom(params)
      })
      return { statusCode: 200, body }
    }

    return errorResponse(400, 'operation must be get, directory, or list.', logger)
  } catch (error) {
    logger.error(error.message || 'Location storefront read failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
