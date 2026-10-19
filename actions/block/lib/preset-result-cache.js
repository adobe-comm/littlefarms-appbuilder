const stateLib = require('@adobe/aio-lib-state')
const { DEFAULT_PRESET_RESULT_CACHE_TTL } = require('./constants')

const encode = value => Buffer.from(String(value)).toString('base64url')
const LIST_CACHE_TTL = stateLib.MAX_TTL
const LIST_CACHE_KEY = 'preset-result.list.global'

function cacheKey (blockId) {
  return `preset-result.${encode(blockId)}`
}

function blockResultCacheKey (blockId, updatedAt) {
  return `preset-result.block.${encode(blockId)}.${encode(String(updatedAt ?? ''))}`
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
    async getBlock (blockId, updatedAt) {
      const result = await state.get(blockResultCacheKey(blockId, updatedAt))
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
    putBlock: (blockId, updatedAt, block) =>
      state.put(
        blockResultCacheKey(blockId, updatedAt),
        JSON.stringify(block),
        { ttl }
      ),
    invalidate: blockId => state.delete(cacheKey(blockId)),
    invalidateAll: () => state.deleteAll({ match: 'preset-result.*' }),
    async getList () {
      const result = await state.get(LIST_CACHE_KEY)
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
    putList: value =>
      state.put(LIST_CACHE_KEY, JSON.stringify(value), { ttl: LIST_CACHE_TTL }),
    invalidateLists: () => state.deleteAll({ match: 'preset-result.list.*' })
  }
}

module.exports = {
  cacheKey,
  LIST_CACHE_KEY,
  blockResultCacheKey,
  createPresetResultCache
}
