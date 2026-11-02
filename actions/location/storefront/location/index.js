const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createLocationStore } = require('../../lib/location-store')
const { createLocationCache } = require('../../lib/location-cache')
const { createStorefrontSwrCache, stableHash } = require('../../../lib/storefront-swr-cache')

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

const LOCATION_DIRECTORY_SWR_KEY = 'location.storefront.directory'

function locationGetKey (lookup) {
  return `location.storefront.get.${stableHash({
    locationId: lookup.locationId,
    title: lookup.title,
    storeUrl: lookup.storeUrl
  })}`
}

function locationListKey (page, pageSize, filters) {
  return `location.storefront.list.${stableHash({ page, pageSize, filters })}`
}

async function main (params) {
  const logger = Core.Logger('location-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    const operation = String(params.operation || '').trim().toLowerCase()
    const store = createLocationStore(params)
    const locationCache = await createLocationCache(params)
    const swr = await createStorefrontSwrCache(params)

    if (operation === 'get') {
      const lookup = lookupFrom(params)
      if (lookup.count !== 1) {
        return errorResponse(400, 'Provide exactly one of locationId, title, or storeUrl.', logger)
      }
      const result = await swr.getOrLoad(
        locationGetKey(lookup),
        async () => {
          const location = await store.getStorefront({
            locationId: lookup.locationId,
            title: lookup.title,
            storeUrl: lookup.storeUrl
          })
          if (!location) {
            const error = new Error('Location not found.')
            error.statusCode = 404
            throw error
          }
          return { location }
        },
        { logger }
      )
      logger.info(`Location get (cache ${result.cacheStatus})`)
      return { statusCode: 200, body: result.body }
    }

    if (operation === 'directory') {
      const result = await swr.getOrLoad(
        LOCATION_DIRECTORY_SWR_KEY,
        async () => {
          const body = await store.listDirectoryGeneral()
          await locationCache.putDirectory(body)
          return body
        },
        { logger }
      )
      logger.info(`Location directory (cache ${result.cacheStatus})`)
      return { statusCode: 200, body: result.body }
    }

    if (operation === 'list') {
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 50))
      const filters = filtersFrom(params)
      const result = await swr.getOrLoad(
        locationListKey(page, pageSize, filters),
        async () => store.listStorefront({ page, pageSize, filters }),
        { logger }
      )
      logger.info(`Location list page ${page} (cache ${result.cacheStatus})`)
      return { statusCode: 200, body: result.body }
    }

    return errorResponse(400, 'operation must be get, directory, or list.', logger)
  } catch (error) {
    logger.error(error.message || 'Location storefront read failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
