const { createEvalCache } = require('../../lib/eval-cache')

async function postProcess (result, prepared, params) {
  const cache = await createEvalCache(params)
  await cache.invalidate(result.rule.storeViewCode)
  return result
}

module.exports = { postProcess }
