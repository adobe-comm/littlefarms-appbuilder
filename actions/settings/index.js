const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../utils')
const { withCommerceCoreGraphqlUrl } = require('../block/lib/enrich-commerce-params')
const { createPresetResultCache } = require('../block/lib/preset-result-cache')
const { createEvalCache } = require('../block/lib/eval-cache')
const { createAttributeCatalog } = require('../block/lib/attribute-catalog')
const { createAttributeState } = require('../block/lib/attribute-state')
const { createBrandCache } = require('../brand/lib/brand-cache')

async function flushStorefront (params) {
  const presetCache = await createPresetResultCache(params)
  const evalCache = await createEvalCache(params)
  const brandCache = await createBrandCache(params)
  await presetCache.invalidateAll()
  await evalCache.invalidate('*')
  await brandCache.invalidateAll()
}

async function attributeStatus (params) {
  const cache = await createAttributeState(params)
  const { record, expiration } = await cache.read()
  return {
    lastSync: Number(record?.lastSync) || null,
    count: Array.isArray(record?.attributes) ? record.attributes.length : 0,
    expiresAt: expiration || null
  }
}

async function main (params) {
  const logger = Core.Logger('app-settings', { level: params.LOG_LEVEL || 'info' })

  try {
    const operation = String(params.operation || 'status').trim().toLowerCase()

    if (operation === 'status') {
      const attributes = await attributeStatus(params)
      return { statusCode: 200, body: { attributes } }
    }

    if (operation === 'flush-storefront') {
      await flushStorefront(params)
      logger.info('Flushed block, evaluation, and brand storefront caches.')
      return { statusCode: 200, body: { flushed: true, scope: 'storefront' } }
    }

    if (operation === 'sync-attributes') {
      params = await withCommerceCoreGraphqlUrl(params)
      const catalog = createAttributeCatalog(params)
      const result = await catalog.syncAttributes()
      logger.info(`Product attributes synced from Settings. count ${result.count}`)
      return { statusCode: 200, body: { synced: true, ...result } }
    }

    return errorResponse(400, 'operation must be status, flush-storefront, or sync-attributes.', logger)
  } catch (error) {
    logger.error(error.message || 'Settings action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
