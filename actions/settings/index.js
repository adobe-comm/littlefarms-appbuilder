const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../utils')
const { withCommerceCoreGraphqlUrl } = require('../block/lib/enrich-commerce-params')
const { createPresetResultCache } = require('../block/lib/preset-result-cache')
const { createEvalCache } = require('../block/lib/eval-cache')
const { createAttributeCatalog } = require('../block/lib/attribute-catalog')
const { createAttributeState } = require('../block/lib/attribute-state')
const { createBrandCache } = require('../brand/lib/brand-cache')
const { createLocationCache } = require('../location/lib/location-cache')
const {
  migrationCatalog,
  migrationStatus,
  migrationUpload,
  migrationUploadChunk,
  migrationUploadComplete,
  migrationStart
} = require('./migration-handlers')

async function flushStorefront (params) {
  const presetCache = await createPresetResultCache(params)
  const evalCache = await createEvalCache(params)
  const brandCache = await createBrandCache(params)
  const locationCache = await createLocationCache(params)
  await presetCache.invalidateAll()
  await evalCache.invalidate('*')
  await brandCache.invalidateAll()
  await locationCache.invalidateAll()
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
      const [attributes, migration] = await Promise.all([
        attributeStatus(params),
        migrationStatus(params)
      ])
      return { statusCode: 200, body: { attributes, migration } }
    }

    if (operation === 'migration-catalog') {
      return { statusCode: 200, body: await migrationCatalog() }
    }

    if (operation === 'migration-status') {
      return { statusCode: 200, body: await migrationStatus(params) }
    }

    if (operation === 'migration-upload') {
      return { statusCode: 200, body: await migrationUpload(params) }
    }

    if (operation === 'migration-upload-chunk') {
      return { statusCode: 200, body: await migrationUploadChunk(params) }
    }

    if (operation === 'migration-upload-complete') {
      return { statusCode: 200, body: await migrationUploadComplete(params) }
    }

    if (operation === 'migration-start') {
      const result = await migrationStart(params, logger)
      return { statusCode: 202, body: result }
    }

    if (operation === 'flush-storefront') {
      await flushStorefront(params)
      logger.info('Flushed block, evaluation, brand, and location caches.')
      return { statusCode: 200, body: { flushed: true, scope: 'storefront' } }
    }

    if (operation === 'sync-attributes') {
      params = await withCommerceCoreGraphqlUrl(params)
      const catalog = createAttributeCatalog(params)
      const result = await catalog.syncAttributes()
      logger.info(`Product attributes synced from Settings. count ${result.count}`)
      return { statusCode: 200, body: { synced: true, ...result } }
    }

    return errorResponse(
      400,
      'operation must be status, flush-storefront, sync-attributes, migration-catalog, migration-status, migration-upload, migration-upload-chunk, migration-upload-complete, or migration-start.',
      logger
    )
  } catch (error) {
    logger.error(error.message || 'Settings action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
