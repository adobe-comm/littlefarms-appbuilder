const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { presetCacheKey } = require('../../lib/preset-store')

async function postProcess (result, _prepared, params) {
  if (result?.preset && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(presetCacheKey(result.preset))
  }
  return result
}

module.exports = { postProcess }
