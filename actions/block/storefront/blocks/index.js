const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPresetStore, readBlockId } = require('../../lib/preset-store')
const { withCommerceCoreGraphqlUrl } = require('../../lib/enrich-commerce-params')
const { enrichPresetForStorefront } = require('../../lib/enrich-storefront-blocks')
const { toPublicBlock } = require('../../lib/public-preset')
const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { createAttributeCatalog } = require('../../lib/attribute-catalog')
const {
  initRuntimeState,
  createAccessTokenProvider,
  shouldProfileRequest,
  createRequestTimings,
  logRequestTimings
} = require('../../lib/runtime-state')

function isWarmPing (params) {
  if (params.warm === true || params.warm === 'true') return true
  const payload = params.trigger_payload
  if (!payload) return false
  if (typeof payload === 'object') return payload.warm === true || payload.warm === 'true'
  try {
    const parsed = JSON.parse(payload)
    return parsed.warm === true || parsed.warm === 'true'
  } catch {
    return false
  }
}

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

function blockCacheIdentity (preset) {
  const blockId = readBlockId(preset)
  if (blockId != null) return String(blockId)
  const id = String(preset?.id || '').trim()
  return id || null
}

async function main (params) {
  const logger = Core.Logger('block-storefront', { level: params.LOG_LEVEL || 'info' })
  const profile = shouldProfileRequest(params)
  const timings = createRequestTimings(profile)

  try {
    if (isWarmPing(params)) {
      return { statusCode: 200, body: { message: 'action is live' } }
    }

    const operation = String(params.operation || 'list').trim().toLowerCase()

    if (operation === 'get') {
      const scope = createPresetStore(params).scope()
      const tokenProvider = createAccessTokenProvider(params)

      const [resolvedParams, runtimeState, preset] = await Promise.all([
        timings.track('config', () => withCommerceCoreGraphqlUrl(params)),
        timings.track('stateInit', () => initRuntimeState(params)),
        timings.track('db', async () => {
          const accessToken = await tokenProvider.getAccessToken()
          const store = createPresetStore({ ...params, __dbAccessToken: accessToken })
          return loadPresetForGet(store, store.scope(), params)
        })
      ])

      const cache = await createPresetResultCache(resolvedParams, null, { state: runtimeState })
      const catalog = createAttributeCatalog(resolvedParams, {
        state: runtimeState,
        getAccessToken: refresh => tokenProvider.getAccessToken(refresh)
      })
      const context = { logger, cache, catalog }

      const cacheId = blockCacheIdentity(preset)
      if (cacheId) {
        const cachedBlock = await timings.track('blockCacheRead', () =>
          cache.getBlock(scope.environmentId, cacheId, preset.updatedAt)
        )
        if (cachedBlock) {
          logger.info(`Block ${cacheId} served from State (full block)`)
          logRequestTimings(logger, 'get', timings, { blockCache: 'hit' })
          return { statusCode: 200, body: { block: cachedBlock } }
        }
      }

      const block = await timings.track('enrich', () =>
        enrichPresetForStorefront(preset, resolvedParams, context)
      )

      if (cacheId) {
        try {
          await timings.track('blockCacheWrite', () =>
            cache.putBlock(scope.environmentId, cacheId, preset.updatedAt, block)
          )
        } catch (cacheError) {
          logger.warn(`Full block cache write failed for ${cacheId}: ${cacheError.message}`)
        }
      }

      logRequestTimings(logger, 'get', timings, { blockCache: cacheId ? 'miss' : 'skipped' })
      return { statusCode: 200, body: { block } }
    }

    const store = createPresetStore(params)
    const scope = store.scope()
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
