const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { withBlogEnvironmentParams } = require('../lib/blog-scope')
const { createPostStore } = require('../lib/post-store')
const { createCategoryStore } = require('../lib/taxonomy-store')
const {
  createBlogStorefrontCache,
  listPostsKey,
  listPostsByCategoryKey,
  getPostKey,
  listCategoriesKey,
  mostReadKey
} = require('../lib/storefront-cache')

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

async function loadCached (cache, key, loadFresh, logger, logLabel) {
  const result = await cache.getOrLoad(key, loadFresh, { logger })
  logger.info(`${logLabel} (cache ${result.cacheStatus})`)
  return result.body
}

async function main (params) {
  const logger = Core.Logger('blog-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    const operation = String(params.operation || '').trim().toLowerCase()
    const posts = createPostStore(params)
    const categories = createCategoryStore(params)
    const cache = await createBlogStorefrontCache(params)

    if (operation === 'list-posts') {
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
      const cacheParams = { page, pageSize, ...listFiltersFrom(params) }
      const body = await loadCached(
        cache,
        listPostsKey(cacheParams),
        () => posts.listStorefront({
          page,
          pageSize,
          filters: listFiltersFrom(params),
          sort: 'newest'
        }),
        logger,
        `Listed blog posts page ${page}`
      )
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
      const cacheParams = {
        page,
        pageSize,
        categoryId,
        categoryUrlKey: params.categoryUrlKey,
        ...listFiltersFrom(params)
      }
      const body = await loadCached(
        cache,
        listPostsByCategoryKey(cacheParams),
        () => posts.listStorefront({
          page,
          pageSize,
          filters: { ...listFiltersFrom(params), categoryId },
          sort: 'newest'
        }).then(listBody => ({ categoryId, ...listBody })),
        logger,
        `Listed blog posts for category ${categoryId}`
      )
      return { statusCode: 200, body }
    }

    if (operation === 'get-post') {
      const cacheParams = {
        postId: params.postId,
        urlKey: params.urlKey || params.url_key
      }
      const body = await loadCached(
        cache,
        getPostKey(cacheParams),
        async () => {
          const post = await posts.getStorefront({
            postId: params.postId,
            urlKey: params.urlKey || params.url_key
          })
          if (!post) {
            const error = new Error('Post not found.')
            error.statusCode = 404
            throw error
          }
          return { post }
        },
        logger,
        'Loaded blog post'
      )
      return { statusCode: 200, body }
    }

    if (operation === 'list-categories') {
      const body = await loadCached(
        cache,
        listCategoriesKey(),
        async () => {
          const items = await categories.listStorefront()
          return { items }
        },
        logger,
        'Listed blog categories'
      )
      return { statusCode: 200, body }
    }

    if (operation === 'most-read') {
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 10))
      const cacheParams = { limit, ...listFiltersFrom(params) }
      const body = await loadCached(
        cache,
        mostReadKey(cacheParams),
        () => posts.listStorefront({
          page: 1,
          pageSize: limit,
          filters: listFiltersFrom(params),
          sort: 'most_read'
        }).then(listBody => ({ items: listBody.items })),
        logger,
        'Listed most-read blog posts'
      )
      return { statusCode: 200, body }
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
