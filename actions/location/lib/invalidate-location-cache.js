const { createLocationCache } = require('./location-cache')
const { invalidateStorefrontSwrCache } = require('../../lib/storefront-swr-cache')

async function invalidateLocationStorefrontCache (params) {
  try {
    const cache = await createLocationCache(params)
    await cache.invalidateDirectory()
    await invalidateStorefrontSwrCache(params, 'location')
  } catch {
    // Storefront cache is best-effort; admin writes must still succeed.
  }
}

module.exports = {
  invalidateLocationStorefrontCache
}
