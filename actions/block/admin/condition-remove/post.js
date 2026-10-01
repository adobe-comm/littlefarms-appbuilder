const { createPresetResultCache } = require('../../lib/preset-result-cache')

async function postProcess (result, prepared, params) {
  const blockId = prepared?.id || result?.id
  if (blockId && params) {
    const cache = await createPresetResultCache(params)
    await cache.invalidate(blockId)
  }
  return result
}

module.exports = { postProcess }
