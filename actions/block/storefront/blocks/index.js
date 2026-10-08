const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPresetStore } = require('../../lib/preset-store')
const { withCommerceCoreGraphqlUrl } = require('../../lib/enrich-commerce-params')
const { enrichPresetForStorefront } = require('../../lib/enrich-storefront-blocks')
const { toPublicBlock } = require('../../lib/public-preset')
const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { createAttributeCatalog } = require('../../lib/attribute-catalog')

function blockTitleFromParams (params) {
  return String(params.title || params.name || params.blockTitle || '').trim()
}

function blockIdFromParams (params) {
  const raw = params.blockId ?? params.sequence ?? params.blockNumber
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const value = Number(raw)
    if (Number.isInteger(value) && value > 0) return value
  }
  return null
}

async function loadPresetForGet (store, scope, params) {
  const blockId = blockIdFromParams(params)
  const id = String(params.id || '').trim()
  const title = blockTitleFromParams(params)
  if (blockId == null && !id && !title) {
    const error = new Error('blockId, id, or title is required.')
    error.statusCode = 400
    throw error
  }

  let preset = null
  if (blockId != null) {
    preset = await store.findByBlockId(scope, blockId)
  } else if (id) {
    if (/^\d+$/.test(id)) {
      preset = await store.findByBlockId(scope, Number(id))
    }
    if (!preset) {
      preset = await store.get(id)
    }
  } else {
    preset = await store.findByTitle(scope, title)
  }
  if (!preset || preset.enabled === false) {
    const error = new Error('Block not found.')
    error.statusCode = 404
    throw error
  }
  if (preset.scope?.environmentId !== scope.environmentId) {
    const error = new Error('Block not found.')
    error.statusCode = 404
    throw error
  }
  return preset
}

async function main (params) {
  const logger = Core.Logger('block-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    const store = createPresetStore(params)
    const scope = store.scope()
    const operation = String(params.operation || 'list').trim().toLowerCase()

    if (operation === 'get') {
      params = await withCommerceCoreGraphqlUrl(params)
      let preset
      try {
        preset = await loadPresetForGet(store, scope, params)
      } catch (error) {
        return errorResponse(error.statusCode || 400, error.message, logger)
      }
      const context = {
        logger,
        cache: await createPresetResultCache(params),
        catalog: createAttributeCatalog(params)
      }
      const block = await enrichPresetForStorefront(preset, params, context)
      return { statusCode: 200, body: { block } }
    }

    const listCache = await createPresetResultCache(params)
    const cached = await listCache.getList(scope.environmentId)
    if (cached) {
      logger.info('Block list served from State')
      return { statusCode: 200, body: cached }
    }

    const presets = (await store.list(scope)).filter(preset => preset.enabled !== false)

    const blocks = presets.map(toPublicBlock)
    const body = { blocks }
    await listCache.putList(scope.environmentId, body)
    logger.info(`Stored ${blocks.length} blocks in State`)
    return {
      statusCode: 200,
      body
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
