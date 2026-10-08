const stateLib = require('@adobe/aio-lib-state')
const { DEFAULT_PRESET_RESULT_CACHE_TTL } = require('./constants')

const encode = value => Buffer.from(String(value)).toString('base64url')
const LIST_CACHE_TTL = stateLib.MAX_TTL

function cacheKey (blockId) {
  return `preset-result.${encode(blockId)}`
}

function listCacheKey (environmentId) {
  return `preset-result.list.${encode(environmentId || 'default')}.${encode('*')}`
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
    invalidateAll: () => state.deleteAll({ match: 'preset-result.*' }),
    async getList (environmentId) {
      const result = await state.get(listCacheKey(environmentId))
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
    putList: (environmentId, value) =>
      state.put(listCacheKey(environmentId), JSON.stringify(value), { ttl: LIST_CACHE_TTL }),
    invalidateLists: () => state.deleteAll({ match: 'preset-result.list.*' })
  }
}

module.exports = { cacheKey, listCacheKey, createPresetResultCache }
