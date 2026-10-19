const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createTagStore } = require('../../lib/taxonomy-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-tag-write', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const fields = params.fields && typeof params.fields === 'object' ? params.fields : {}
    const store = createTagStore(params)
    const tag = await store.save(fields, params.tagId)
    logger.info(`Saved blog tag ${tag.tagId}`)
    return { statusCode: 200, body: { tag } }
  } catch (error) {
    logger.error(error.message || 'Blog tag save failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
