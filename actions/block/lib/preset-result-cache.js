const stateLib = require('@adobe/aio-lib-state')
const { DEFAULT_PRESET_RESULT_CACHE_TTL } = require('./constants')

const encode = value => Buffer.from(String(value)).toString('base64url')

function cacheKey (blockId) {
  return `preset-result.${encode(blockId)}`
}

async function createPresetResultCache (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })
  const ttl = Number(params.PRESET_RESULT_CACHE_TTL) || DEFAULT_PRESET_RESULT_CACHE_TTL

  return {
    key: cacheKey,
    async get (blockId) {
      const result = await state.get(cacheKey(blockId))
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
    put: (blockId, value) =>
      state.put(cacheKey(blockId), JSON.stringify(value), { ttl }),
    invalidate: blockId => state.delete(cacheKey(blockId)),
    invalidateAll: () => state.deleteAll({ match: 'preset-result.*' })
  }
}

module.exports = { cacheKey, createPresetResultCache }
