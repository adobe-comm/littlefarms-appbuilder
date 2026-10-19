const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createCategoryStore } = require('../../lib/taxonomy-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-category-list', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const store = createCategoryStore(params)
    const categoryId = String(params.categoryId || '').trim()
    if (categoryId) {
      const category = await store.get(categoryId)
      if (!category) return errorResponse(404, 'Category not found.', logger)
      return { statusCode: 200, body: { category } }
    }
    const page = await store.list({
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
      listAll: params.listAll === true || params.listAll === 'true',
      filters: { title: params.title, url_key: params.url_key }
    })
    logger.info(`Listed ${page.total} blog categories`)
    return { statusCode: 200, body: page }
  } catch (error) {
    logger.error(error.message || 'Blog category list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
