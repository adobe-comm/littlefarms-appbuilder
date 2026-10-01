const stateLib = require('@adobe/aio-lib-state')
const { DEFAULT_CACHE_TTL } = require('./constants')

const encode = value => Buffer.from(String(value)).toString('base64url')

function cacheKey (storeViewCode, sku) {
  return `eval.${encode(storeViewCode)}.${encode(sku)}`
}

async function createEvalCache (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })
  const ttl = Number(params.EVAL_CACHE_TTL) || DEFAULT_CACHE_TTL

  return {
    key: cacheKey,
    async get (storeViewCode, sku) {
      const result = await state.get(cacheKey(storeViewCode, sku))
      return result?.value ?? null
    },
    put: (storeViewCode, sku, value) =>
      state.put(cacheKey(storeViewCode, sku), value, { ttl }),
    invalidate: storeViewCode =>
      state.deleteAll({ match: storeViewCode === '*' ? 'eval.*' : `eval.${encode(storeViewCode)}.*` })
  }
}

module.exports = { cacheKey, createEvalCache }
