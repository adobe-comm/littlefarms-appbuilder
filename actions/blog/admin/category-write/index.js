const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createCategoryStore } = require('../../lib/taxonomy-store')

async function main (params) {
  const logger = Core.Logger('blog-category-write', { level: params.LOG_LEVEL || 'info' })

  try {
    const fields = params.fields && typeof params.fields === 'object' ? params.fields : {}
    const store = createCategoryStore(params)
    const category = await store.save(fields, params.categoryId)
    logger.info(`Saved blog category ${category.categoryId}`)
    return { statusCode: 200, body: { category } }
  } catch (error) {
    logger.error(error.message || 'Blog category save failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
