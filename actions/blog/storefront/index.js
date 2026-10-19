const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { withBlogEnvironmentParams } = require('../lib/blog-scope')
const { createPostStore } = require('../lib/post-store')
const { createCategoryStore } = require('../lib/taxonomy-store')

function isWarmPing (params) {
  if (params.warm === true || params.warm === 'true') return true
  const payload = params.trigger_payload
  if (!payload) return false
  if (typeof payload === 'object') return payload.warm === true || payload.warm === 'true'
  try {
    const parsed = JSON.parse(payload)
    return parsed.warm === true || parsed.warm === 'true'
  } catch {
    return false
  }
}

function optionalBoolean (value) {
  if (value == null || value === '') return undefined
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  const error = new Error('Boolean filter value is not valid.')
  error.statusCode = 400
  throw error
}

function listFiltersFrom (params) {
  return {
    categoryId: params.categoryId,
    tagId: params.tagId,
    isFeatured: optionalBoolean(params.isFeatured),
    isRecipe: optionalBoolean(params.isRecipe),
    customerGroupId: params.customerGroupId
  }
}

async function main (params) {
  const logger = Core.Logger('blog-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    if (isWarmPing(params)) {
      return { statusCode: 200, body: { message: 'action is live' } }
    }

    params = await withBlogEnvironmentParams(params)
    const operation = String(params.operation || '').trim().toLowerCase()
    const posts = createPostStore(params)
    const categories = createCategoryStore(params)

    if (operation === 'list-posts') {
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
      const body = await posts.listStorefront({
        page,
        pageSize,
        filters: listFiltersFrom(params),
        sort: 'newest'
      })
      logger.info(`Listed ${body.items.length} blog posts (page ${body.page})`)
      return { statusCode: 200, body }
    }

    if (operation === 'list-posts-by-category') {
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
      const categoryId = await categories.resolveCategoryId({
        categoryId: params.categoryId,
        categoryUrlKey: params.categoryUrlKey
      })
      if (!categoryId) return errorResponse(404, 'Category not found.', logger)
      const body = await posts.listStorefront({
        page,
        pageSize,
        filters: { ...listFiltersFrom(params), categoryId },
        sort: 'newest'
      })
      logger.info(`Listed ${body.items.length} blog posts for category ${categoryId}`)
      return { statusCode: 200, body: { categoryId, ...body } }
    }

    if (operation === 'get-post') {
      const post = await posts.getStorefront({
        postId: params.postId,
        urlKey: params.urlKey || params.url_key
      })
      if (!post) return errorResponse(404, 'Post not found.', logger)
      return { statusCode: 200, body: { post } }
    }

    if (operation === 'list-categories') {
      const items = await categories.listStorefront()
      logger.info(`Listed ${items.length} blog categories`)
      return { statusCode: 200, body: { items } }
    }

    if (operation === 'most-read') {
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 10))
      const body = await posts.listStorefront({
        page: 1,
        pageSize: limit,
        filters: listFiltersFrom(params),
        sort: 'most_read'
      })
      return { statusCode: 200, body: { items: body.items } }
    }

    if (operation === 'record-visit') {
      const result = await posts.incrementViewCount({
        postId: params.postId,
        urlKey: params.urlKey || params.url_key
      })
      logger.info(`Recorded visit for post ${result.postId} (${result.view_count})`)
      return { statusCode: 200, body: result }
    }

    return errorResponse(
      400,
      'operation must be list-posts, list-posts-by-category, get-post, list-categories, most-read, or record-visit.',
      logger
    )
  } catch (error) {
    logger.error(error.message || 'Blog storefront request failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
