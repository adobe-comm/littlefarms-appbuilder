const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { withCommerceCoreGraphqlUrl } = require('../lib/enrich-commerce-params')
const { createAttributeCatalog } = require('../lib/attribute-catalog')
const { createAttributeState, isAttributeChangeEvent, needsAttributeSync } = require('../lib/attribute-state')

function scheduled (params) {
  if (params.scheduled === true || params.scheduled === 'true') return true
  const payload = params.trigger_payload
  if (!payload) return false
  if (typeof payload === 'object') return payload.scheduled === true
  try {
    return JSON.parse(payload).scheduled === true
  } catch {
    return false
  }
}

async function main (params) {
  const logger = Core.Logger('attribute-sync', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withCommerceCoreGraphqlUrl(params)
    const catalog = createAttributeCatalog(params)
    const attributeEvent = isAttributeChangeEvent(params)
    const force = attributeEvent || scheduled(params)
    if (!force) {
      const cache = await createAttributeState(params)
      const { record, expiration } = await cache.read()
      if (!needsAttributeSync(record, expiration)) {
        logger.info(`Product attributes are current. lastSync ${record.lastSync}`)
        return {
          statusCode: 200,
          body: { synced: false, lastSync: record.lastSync, count: record.attributes.length }
        }
      }
    }
    const result = await catalog.syncAttributes()
    const reason = attributeEvent ? 'attribute-event' : 'schedule'
    logger.info(`Product attributes synced (${reason}). count ${result.count}`)
    return { statusCode: 200, body: { synced: true, reason, ...result } }
  } catch (error) {
    logger.error(error.message || 'Attribute sync failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
