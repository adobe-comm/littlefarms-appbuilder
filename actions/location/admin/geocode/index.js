const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')

function part (value) {
  return String(value || '').trim().slice(0, 200)
}

async function main (params) {
  const logger = Core.Logger('location-geocode', { level: params.LOG_LEVEL || 'info' })

  try {
    const query = [part(params.street), part(params.city), part(params.state), part(params.country)].filter(Boolean)
    if (query.length < 2) {
      return errorResponse(400, 'Enter a country, city, and street before finding the store on the map.', logger)
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query.join(', '))}`
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LittleFarmsLocations/1.0 (store location admin)'
      }
    })
    if (!response.ok) return errorResponse(502, 'Map lookup is unavailable.', logger)
    const matches = await response.json()
    const match = Array.isArray(matches) ? matches[0] : null
    const latitude = Number(match?.lat)
    const longitude = Number(match?.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return errorResponse(404, 'No map location matched that address.', logger)
    }
    logger.info('Resolved a store address to coordinates.')
    return {
      statusCode: 200,
      body: {
        latitude: String(latitude),
        longitude: String(longitude)
      }
    }
  } catch (error) {
    logger.error(error.message || 'Location geocode failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
