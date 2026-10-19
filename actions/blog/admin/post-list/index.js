const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createPostStore } = require('../../lib/post-store')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-post-list', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const store = createPostStore(params)
    const postId = String(params.postId || '').trim()
    if (postId) {
      const post = await store.get(postId)
      if (!post) return errorResponse(404, 'Post not found.', logger)
      logger.info(`Opened blog post ${post.postId}`)
      return { statusCode: 200, body: { post } }
    }
    const page = await store.list({
      page: params.page,
      pageSize: params.pageSize,
      sortDir: params.sortDir,
      filters: {
        title: params.title,
        url_key: params.url_key,
        status: params.status,
        categoryId: params.categoryId,
        tagId: params.tagId
      }
    })
    logger.info(`Listed blog posts page ${page.page} (${page.total} match)`)
    return { statusCode: 200, body: page }
  } catch (error) {
    logger.error(error.message || 'Blog post list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
