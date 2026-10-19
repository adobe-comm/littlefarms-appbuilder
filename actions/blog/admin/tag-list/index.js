const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createTagStore } = require('../../lib/taxonomy-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-tag-list', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const store = createTagStore(params)
    const tagId = String(params.tagId || '').trim()
    if (tagId) {
      const tag = await store.get(tagId)
      if (!tag) return errorResponse(404, 'Tag not found.', logger)
      logger.info(`Opened blog tag ${tag.tagId}`)
      return { statusCode: 200, body: { tag } }
    }
    const page = await store.list({
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
      filters: {
        title: params.title,
        url_key: params.url_key
      }
    })
    logger.info(`Listed blog tags page ${page.page} (${page.total} match)`)
    return { statusCode: 200, body: page }
  } catch (error) {
    logger.error(error.message || 'Blog tag list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
