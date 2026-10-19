const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createContentStore } = require('../../lib/content-store')

async function main (params) {
  const logger = Core.Logger('location-content-write', { level: params.LOG_LEVEL || 'info' })

  try {
    const kind = String(params.kind || '').trim()
    const fields = params.fields && typeof params.fields === 'object' ? params.fields : {}
    const entityId = params.entityId || params.serviceId || params.galleryId || params.profileId
    const store = createContentStore(params)
    const item = await store.save(kind, fields, entityId)
    logger.info(`Saved location ${kind} ${item.serviceId || item.galleryId || item.profileId}`)
    return { statusCode: 200, body: { item } }
  } catch (error) {
    logger.error(error.message || 'Location content save failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
