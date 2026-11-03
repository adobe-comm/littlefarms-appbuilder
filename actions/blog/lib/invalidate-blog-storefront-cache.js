const { invalidateStorefrontSwrCache } = require('../../lib/storefront-swr-cache')

async function invalidateBlogStorefrontCache (params) {
  await invalidateStorefrontSwrCache(params, 'blog')
}

module.exports = {
  invalidateBlogStorefrontCache
}
