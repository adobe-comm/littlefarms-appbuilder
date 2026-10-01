const { createAttributeCatalog } = require('./attribute-catalog')
const { createPresetResultCache } = require('./preset-result-cache')
const { presetCacheKey } = require('./preset-store')
const { BLOCK_TYPE_BRANDS_LIST, DEFAULT_BLOCK_TYPE } = require('./constants')

function presetToMatchRule (preset) {
  const logic = preset?.logic || {}
  return {
    aggregator: logic.aggregator || 'all',
    matchValue: logic.matchValue !== false,
    productsToDisplay: logic.productsToDisplay,
    conditions: logic.conditions || []
  }
}

function isConditionalPreset (preset) {
  const blockType = preset?.blockType || DEFAULT_BLOCK_TYPE
  return blockType !== BLOCK_TYPE_BRANDS_LIST
}

async function resolveConditionResultSkus (preset, params, options = {}) {
  if (!preset || !isConditionalPreset(preset)) {
    return []
  }

  const cacheKey = presetCacheKey(preset)
  const cache = options.cache || await createPresetResultCache(params)
  if (!options.skipCache) {
    const cached = await cache.get(cacheKey)
    if (Array.isArray(cached?.skus)) {
      return cached.skus
    }
  }

  const catalog = options.catalog || createAttributeCatalog(params)
  const products = await catalog.matchProducts(presetToMatchRule(preset))
  const skus = products.map(product => product.sku).filter(Boolean)

  if (skus.length > 0) {
    try {
      await cache.put(cacheKey, { skus, cachedAt: Date.now() })
    } catch (cacheError) {
      options.logger?.warn?.(`Preset SKU cache write failed for block ${cacheKey}: ${cacheError.message}`)
    }
  }
  return skus
}

module.exports = {
  presetToMatchRule,
  isConditionalPreset,
  resolveConditionResultSkus
}
