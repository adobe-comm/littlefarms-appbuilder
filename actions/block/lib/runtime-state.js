const stateLib = require('@adobe/aio-lib-state')
const { Core } = require('@adobe/aio-sdk')

function stateRegion (params) {
  return params.STATE_REGION || 'amer'
}

async function initRuntimeState (params, stateFactory = stateLib.init) {
  return stateFactory({ region: stateRegion(params) })
}

function createAccessTokenProvider (params, tokenFactory = Core.AuthClient.generateAccessToken) {
  let tokenPromise
  let cachedToken

  async function getAccessToken (refresh = false) {
    if (refresh) {
      cachedToken = undefined
      tokenPromise = undefined
    }
    if (!refresh && cachedToken) return cachedToken
    if (!refresh && tokenPromise) {
      cachedToken = await tokenPromise
      return cachedToken
    }
    tokenPromise = tokenFactory(params).then(result => {
      cachedToken = result.access_token
      return cachedToken
    })
    return tokenPromise
  }

  return { getAccessToken }
}

function shouldProfileRequest (params) {
  const profile = params.PROFILE ?? params.profile
  if (profile === true || profile === 'true' || profile === '1') return true
  return String(params.LOG_LEVEL || '').toLowerCase() === 'debug'
}

function createRequestTimings (enabled) {
  const marks = enabled ? {} : null
  return {
    async track (name, fn) {
      if (!marks) return fn()
      const start = Date.now()
      try {
        return await fn()
      } finally {
        marks[name] = Date.now() - start
      }
    },
    toObject () {
      return marks ? { ...marks } : null
    }
  }
}

function logRequestTimings (logger, operation, timings, extra = {}) {
  const payload = timings.toObject()
  if (!payload) return
  logger.info(`block-storefront timings (${operation}): ${JSON.stringify({ ...payload, ...extra })}`)
}

module.exports = {
  initRuntimeState,
  createAccessTokenProvider,
  shouldProfileRequest,
  createRequestTimings,
  logRequestTimings
}
