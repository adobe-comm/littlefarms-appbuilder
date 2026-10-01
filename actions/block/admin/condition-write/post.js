const { createPresetResultCache } = require('../../lib/preset-result-cache')

async function postProcess (result, _prepared, params) {
  if (result?.preset?.id && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(result.preset.id)
  }
  return result
}

module.exports = { postProcess }
