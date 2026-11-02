const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { presetCacheKey } = require('../../lib/preset-store')
const { invalidateStorefrontSwrCache } = require('../../../lib/storefront-swr-cache')

async function postProcess (result, _prepared, params) {
  if (result?.preset && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(presetCacheKey(result.preset))
    await cache.invalidateLists()
    await invalidateStorefrontSwrCache(params, 'block')
  }
  return result
}

module.exports = { postProcess }
