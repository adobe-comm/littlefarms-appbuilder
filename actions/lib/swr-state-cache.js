const stateLib = require('@adobe/aio-lib-state')

const DEFAULT_STATE_TTL = stateLib.MAX_TTL

function parseEnvelope (result) {
  const raw = result?.value
  if (raw == null || raw === '') return null
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || parsed.cachedAt == null) return null
  return parsed
}

async function writeEnvelope (state, key, body, ttl = DEFAULT_STATE_TTL) {
  const envelope = {
    cachedAt: Date.now(),
    body
  }
  await state.put(key, JSON.stringify(envelope), { ttl })
}

/**
 * App-layer stale-while-revalidate on aio-lib-state.
 * State TTL is long; freshness is enforced via cachedAt + freshMs / swrMs.
 */
async function createSwrStateCache (params, options = {}) {
  const stateFactory = options.stateFactory || stateLib.init
  const state = options.state || await stateFactory({ region: params.STATE_REGION || 'amer' })
  const freshMs = (Number(params[options.freshSecondsParam || 'SWR_CACHE_FRESH_SECONDS']) ||
    options.defaultFreshSeconds ||
    60) * 1000
  const swrMs = (Number(params[options.swrSecondsParam || 'SWR_CACHE_SWR_SECONDS']) ||
    options.defaultSwrSeconds ||
    3600) * 1000
  const stateTtl = options.stateTtl || DEFAULT_STATE_TTL

  async function revalidate (key, loadFresh, logger) {
    try {
      const body = await loadFresh()
      await writeEnvelope(state, key, body, stateTtl)
      if (logger) logger.info(`SWR revalidated cache key ${key}`)
    } catch (error) {
      if (logger) logger.warn(`SWR revalidate failed for ${key}: ${error.message || error}`)
    }
  }

  return {
    freshMs,
    swrMs,
    async getOrLoad (key, loadFresh, { logger } = {}) {
      const entry = parseEnvelope(await state.get(key))
      const now = Date.now()

      if (entry && Object.prototype.hasOwnProperty.call(entry, 'body')) {
        const age = now - Number(entry.cachedAt)
        if (age >= 0 && age < freshMs) {
          return { body: entry.body, cacheStatus: 'fresh' }
        }
        if (age >= 0 && age < freshMs + swrMs) {
          void revalidate(key, loadFresh, logger)
          return { body: entry.body, cacheStatus: 'stale' }
        }
      }

      const body = await loadFresh()
      await writeEnvelope(state, key, body, stateTtl)
      return { body, cacheStatus: 'miss' }
    },
    invalidateKey (key) {
      return state.delete(key)
    },
    invalidateAll (match = 'swr.*') {
      return state.deleteAll({ match })
    }
  }
}

module.exports = {
  DEFAULT_STATE_TTL,
  createSwrStateCache,
  parseEnvelope,
  writeEnvelope
}
