const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createContentStore } = require('../../lib/content-store')

async function main (params) {
  const logger = Core.Logger('location-content-list', { level: params.LOG_LEVEL || 'info' })

  try {
    const kind = String(params.kind || '').trim()
    const store = createContentStore(params)
    const entityId = String(params.entityId || params.serviceId || params.galleryId || params.profileId || '').trim()

    if (entityId) {
      const item = await store.get(kind, entityId)
      if (!item) return errorResponse(404, 'Record not found.', logger)
      logger.info(`Opened location ${kind} ${entityId}`)
      return { statusCode: 200, body: { item } }
    }

    const picker = params.picker === true || params.picker === 'true'
    const page = await store.list({
      kind,
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
      search: params.search || params.title || params.name,
      enabledOnly: picker || params.enabledOnly === true || params.enabledOnly === 'true',
      picker
    })
    logger.info(`Listed location ${kind}${picker ? ' picker' : ''} (${page.total ?? page.options?.length ?? 0})`)
    return { statusCode: 200, body: page }
  } catch (error) {
    logger.error(error.message || 'Location content list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
