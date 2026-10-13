const { createLocationCache } = require('./location-cache')

async function invalidateLocationStorefrontCache (params) {
  try {
    const cache = await createLocationCache(params)
    await cache.invalidateDirectory()
  } catch {
    // Storefront cache is best-effort; admin writes must still succeed.
  }
}

module.exports = {
  invalidateLocationStorefrontCache
}
