const { createEvalCache } = require('../../lib/eval-cache')

async function postProcess (result, prepared, params) {
  const cache = await createEvalCache(params)
  await cache.invalidate(prepared.rule.storeViewCode)
  return { deleted: result.deleted, id: prepared.rule.id }
}

module.exports = { postProcess }
