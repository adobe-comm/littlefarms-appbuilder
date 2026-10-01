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
      const raw = result?.value
      if (raw == null || raw === '') return null
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      }
      return raw
    },
    put: (storeViewCode, sku, value) =>
      state.put(cacheKey(storeViewCode, sku), JSON.stringify(value), { ttl }),
    invalidate: storeViewCode =>
      state.deleteAll({ match: storeViewCode === '*' ? 'eval.*' : `eval.${encode(storeViewCode)}.*` })
  }
}

module.exports = { cacheKey, createEvalCache }
