const { createEvalCache } = require('../../lib/eval-cache')

async function preProcess (request, params) {
  const cache = await createEvalCache(params)
  const cached = await cache.get(request.storeViewCode, request.sku)
  return { ...request, cache, cached }
}

module.exports = { preProcess }
