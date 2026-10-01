const { toPublicBlock } = require('./public-preset')
const { createPresetResultCache } = require('./preset-result-cache')
const { createAttributeCatalog } = require('./attribute-catalog')
const { isConditionalPreset, resolveConditionResultSkus } = require('./resolve-preset-skus')

function shouldResolveConditions (params) {
  const flag = params.resolveConditions ?? params.resolve_conditions
  if (flag === false || flag === 'false' || flag === '0') {
    return false
  }
  return true
}

function setSkuResolutionStatus (featured, status, logger, message) {
  featured.productSkusStatus = status
  if (message && logger?.info) {
    logger.info(`Condition SKU resolution (${status}): ${message}`)
  }
}

async function enrichPresetForStorefront (preset, params, context) {
  const block = toPublicBlock(preset)
  if (!shouldResolveConditions(params) || !isConditionalPreset(preset) || !block.featuredRecommended) {
    return block
  }

  if (!String(params.COMMERCE_CORE_GRAPHQL_URL || '').trim()) {
    setSkuResolutionStatus(
      block.featuredRecommended,
      'commerce_unconfigured',
      context.logger,
      `block ${preset.id} — set COMMERCE_CORE_GRAPHQL_URL on block-storefront or App Management business config`
    )
    return block
  }

  try {
    const skus = await resolveConditionResultSkus(preset, params, context)
    block.featuredRecommended.productSkus = skus
    setSkuResolutionStatus(
      block.featuredRecommended,
      skus.length ? 'ok' : 'empty',
      context.logger,
      skus.length ? `block ${preset.id}: ${skus.length} SKU(s)` : `block ${preset.id}: Commerce returned no matches`
    )
  } catch (error) {
    setSkuResolutionStatus(
      block.featuredRecommended,
      'error',
      context.logger,
      `block ${preset.id}: ${error.message}`
    )
    block.featuredRecommended.productSkus = []
  }
  return block
}

async function enrichPresetsForStorefront (presets, params, logger) {
  if (!shouldResolveConditions(params)) {
    return presets.map(toPublicBlock)
  }

  const context = {
    logger,
    cache: await createPresetResultCache(params),
    catalog: createAttributeCatalog(params)
  }

  return Promise.all(presets.map(preset => enrichPresetForStorefront(preset, params, context)))
}

module.exports = {
  shouldResolveConditions,
  enrichPresetForStorefront,
  enrichPresetsForStorefront
}
