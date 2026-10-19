const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPostStore } = require('../../lib/post-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-post-write', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const fields = params.fields && typeof params.fields === 'object' ? params.fields : {}
    const store = createPostStore(params)
    const post = await store.save(fields, params.postId)
    logger.info(`Saved blog post ${post.postId}`)
    return { statusCode: 200, body: { post } }
  } catch (error) {
    logger.error(error.message || 'Blog post save failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
