const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createCategoryStore } = require('../../lib/taxonomy-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')
const { invalidateBlogStorefrontCache } = require('../../lib/invalidate-blog-storefront-cache')

async function main (params) {
  const logger = Core.Logger('blog-category-mass', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const operation = String(params.operation || '').trim()
    if (operation !== 'delete') throw new Error('Unknown mass action.')
    const store = createCategoryStore(params)
    const result = await store.remove(params.ids)
    if (result.affected > 0) await invalidateBlogStorefrontCache(params)
    logger.info(`Blog category mass delete affected ${result.affected}`)
    return { statusCode: 200, body: { operation, affected: result.affected } }
  } catch (error) {
    logger.error(error.message || 'Blog category mass action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
