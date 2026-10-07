const { createPresetResultCache } = require('../../lib/preset-result-cache')

async function postProcess (result, prepared, params) {
  const key = prepared?.cacheKey || prepared?.id || result?.id
  if (key && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(String(key))
    await cache.invalidateLists()
  }
  return result
}

module.exports = { postProcess }
