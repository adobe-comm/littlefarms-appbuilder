const {
  createStorefrontSwrCache,
  stableHash
} = require('../../lib/storefront-swr-cache')
const { BLOG_STOREFRONT_CACHE_MATCH } = require('./constants')

function listPostsKey (params) {
  return `blog.storefront.list-posts.${stableHash({
    page: params.page,
    pageSize: params.pageSize,
    categoryId: params.categoryId,
    tagId: params.tagId,
    isFeatured: params.isFeatured,
    isRecipe: params.isRecipe,
    customerGroupId: params.customerGroupId
  })}`
}

function listPostsByCategoryKey (params) {
  return `blog.storefront.list-posts-by-category.${stableHash({
    page: params.page,
    pageSize: params.pageSize,
    categoryId: params.categoryId,
    categoryUrlKey: params.categoryUrlKey,
    tagId: params.tagId,
    isFeatured: params.isFeatured,
    isRecipe: params.isRecipe,
    customerGroupId: params.customerGroupId
  })}`
}

function getPostKey (params) {
  const postId = params.postId != null ? String(params.postId).trim() : ''
  const urlKey = String(params.urlKey || params.url_key || '').trim()
  return `blog.storefront.get-post.${stableHash({ postId, urlKey })}`
}

function listCategoriesKey () {
  return 'blog.storefront.list-categories'
}

function mostReadKey (params) {
  return `blog.storefront.most-read.${stableHash({
    limit: params.limit,
    categoryId: params.categoryId,
    tagId: params.tagId,
    isFeatured: params.isFeatured,
    isRecipe: params.isRecipe,
    customerGroupId: params.customerGroupId
  })}`
}

async function createBlogStorefrontCache (params) {
  return createStorefrontSwrCache(params)
}

module.exports = {
  BLOG_STOREFRONT_CACHE_MATCH,
  listPostsKey,
  listPostsByCategoryKey,
  getPostKey,
  listCategoriesKey,
  mostReadKey,
  createBlogStorefrontCache
}
