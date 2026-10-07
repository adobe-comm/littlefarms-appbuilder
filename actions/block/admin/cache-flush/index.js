const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPresetResultCache } = require('../../lib/preset-result-cache')
const { createEvalCache } = require('../../lib/eval-cache')

async function main (params) {
  const logger = Core.Logger('block-cache-flush', { level: params.LOG_LEVEL || 'info' })

  try {
    const blockId = String(params.id || params.blockId || '').trim()
    const presetCache = await createPresetResultCache(params)
    const evalCache = await createEvalCache(params)

    if (blockId) {
      await presetCache.invalidate(blockId)
      await presetCache.invalidateLists()
      logger.info(`Flushed preset result cache for block ${blockId}`)
      return { statusCode: 200, body: { flushed: true, scope: 'block', id: blockId } }
    }

    await presetCache.invalidateAll()
    await evalCache.invalidate('*')
    logger.info('Flushed all preset result and PDP evaluation caches')
    return { statusCode: 200, body: { flushed: true, scope: 'all' } }
  } catch (error) {
    logger.error(error)
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
