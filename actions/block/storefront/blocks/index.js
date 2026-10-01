const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { validateStorefrontSecretUnlessPublicPresetRead } = require('../../lib/storefront-auth')
const { createPresetStore } = require('../../lib/preset-store')
const { withCommerceCoreGraphqlUrl } = require('../../lib/enrich-commerce-params')
const { enrichPresetForStorefront, enrichPresetsForStorefront } = require('../../lib/enrich-storefront-blocks')
const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { createAttributeCatalog } = require('../../lib/attribute-catalog')
const { DEFAULT_BLOCK_TYPE } = require('../../lib/constants')

async function main (params) {
  const logger = Core.Logger('block-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withCommerceCoreGraphqlUrl(params)

    const auth = validateStorefrontSecretUnlessPublicPresetRead(params)
    if (!auth.valid) {
      return errorResponse(auth.statusCode, auth.error, logger)
    }

    const store = createPresetStore(params)
    const scope = store.scope()
    const operation = String(params.operation || 'list').trim().toLowerCase()

    if (operation === 'get') {
      const id = String(params.id || '').trim()
      if (!id) return errorResponse(400, 'id is required.', logger)
      const preset = await store.get(id)
      if (!preset || preset.enabled === false) {
        return errorResponse(404, 'Block not found.', logger)
      }
      if (preset.scope?.environmentId !== scope.environmentId) {
        return errorResponse(404, 'Block not found.', logger)
      }
      const context = {
        logger,
        cache: await createPresetResultCache(params),
        catalog: createAttributeCatalog(params)
      }
      const block = await enrichPresetForStorefront(preset, params, context)
      return { statusCode: 200, body: { block } }
    }

    let presets = await store.list(scope)
    presets = presets.filter(preset => preset.enabled !== false)
    const blockType = String(params.blockType || '').trim()
    if (blockType) {
      presets = presets.filter(preset => (preset.blockType || DEFAULT_BLOCK_TYPE) === blockType)
    }

    const blocks = await enrichPresetsForStorefront(presets, params, logger)
    return {
      statusCode: 200,
      body: { blocks }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
