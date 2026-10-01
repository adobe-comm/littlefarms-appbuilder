const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { validateStorefrontSecret } = require('../../lib/storefront-auth')
const { createPresetStore } = require('../../lib/preset-store')
const { withCommerceCoreGraphqlUrl } = require('../../lib/enrich-commerce-params')
const { toPublicBlock } = require('../../lib/public-preset')
const { DEFAULT_BLOCK_TYPE } = require('../../lib/constants')

async function main (params) {
  const logger = Core.Logger('block-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withCommerceCoreGraphqlUrl(params)

    const auth = validateStorefrontSecret(params)
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
      return { statusCode: 200, body: { block: toPublicBlock(preset) } }
    }

    let presets = await store.list(scope)
    presets = presets.filter(preset => preset.enabled !== false)
    const blockType = String(params.blockType || '').trim()
    if (blockType) {
      presets = presets.filter(preset => (preset.blockType || DEFAULT_BLOCK_TYPE) === blockType)
    }

    return {
      statusCode: 200,
      body: { blocks: presets.map(toPublicBlock) }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
