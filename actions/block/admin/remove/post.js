const { createEvalCache } = require('../../lib/eval-cache')
const { invalidateStorefrontSwrCache } = require('../../../lib/storefront-swr-cache')

async function postProcess (result, prepared, params) {
  const cache = await createEvalCache(params)
  await cache.invalidate(prepared.rule.storeViewCode)
  await invalidateStorefrontSwrCache(params, 'block')
  return { deleted: result.deleted, id: prepared.rule.id }
}

module.exports = { postProcess }
