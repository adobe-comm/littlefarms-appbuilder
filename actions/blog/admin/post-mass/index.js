const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPostStore } = require('../../lib/post-store')

async function main (params) {
  const logger = Core.Logger('blog-post-mass', { level: params.LOG_LEVEL || 'info' })

  try {
    const operation = String(params.operation || '').trim()
    if (operation !== 'delete') throw new Error('Unknown mass action.')
    const store = createPostStore(params)
    const result = await store.remove(params.ids)
    logger.info(`Blog post mass delete affected ${result.affected}`)
    return { statusCode: 200, body: { operation, affected: result.affected } }
  } catch (error) {
    logger.error(error.message || 'Blog post mass action failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
