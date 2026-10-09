const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createLocationStore } = require('../../lib/location-store')

function filtersFrom (params) {
  return {
    idFrom: params.idFrom,
    idTo: params.idTo,
    title: params.title,
    country: params.country,
    city: params.city,
    street: params.street,
    phone: params.phone,
    email: params.email,
    websiteUrl: params.websiteUrl,
    zip: params.zip,
    status: params.status
  }
}

async function main (params) {
  const logger = Core.Logger('location-list', { level: params.LOG_LEVEL || 'info' })

  try {
    const store = createLocationStore(params)
    const locationId = String(params.locationId || '').trim()
    if (locationId) {
      const location = await store.get(locationId)
      if (!location) return errorResponse(404, 'Location not found.', logger)
      logger.info(`Opened location ${location.locationId}`)
      return { statusCode: 200, body: { location } }
    }
    const page = await store.list({
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
      filters: filtersFrom(params),
      exportAll: params.exportAll === true || params.exportAll === 'true'
    })
    logger.info(`Listed locations page ${page.page} (${page.total} match)`)
    return { statusCode: 200, body: page }
  } catch (error) {
    logger.error(error.message || 'Location list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
