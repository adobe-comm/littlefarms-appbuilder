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

function blockResultCacheKey (environmentId, blockId, updatedAt) {
  return `preset-result.block.${encode(environmentId || 'default')}.${encode(blockId)}.${encode(String(updatedAt ?? ''))}`
}

async function createPresetResultCache (params, stateFactory, options = {}) {
  const initState = stateFactory || stateLib.init
  const state = options.state || await initState({ region: params.STATE_REGION || 'amer' })
  const ttl = Number(params.PRESET_RESULT_CACHE_TTL) || DEFAULT_PRESET_RESULT_CACHE_TTL

  return {
    key: cacheKey,
    blockResultCacheKey,
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
    async getBlock (environmentId, blockId, updatedAt) {
      const result = await state.get(blockResultCacheKey(environmentId, blockId, updatedAt))
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
    putBlock: (environmentId, blockId, updatedAt, block) =>
      state.put(
        blockResultCacheKey(environmentId, blockId, updatedAt),
        JSON.stringify(block),
        { ttl }
      ),
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

module.exports = {
  cacheKey,
  listCacheKey,
  blockResultCacheKey,
  createPresetResultCache
}
