const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { invalidateStorefrontSwrCache } = require('../../../lib/storefront-swr-cache')

async function postProcess (result, prepared, params) {
  const key = prepared?.cacheKey || prepared?.id || result?.id
  if (key && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(String(key))
    await cache.invalidateLists()
    await invalidateStorefrontSwrCache(params, 'block')
  }
  return result
}

module.exports = { postProcess }
