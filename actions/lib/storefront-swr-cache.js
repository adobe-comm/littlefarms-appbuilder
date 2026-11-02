const crypto = require('crypto')
const { createSwrStateCache } = require('./swr-state-cache')

const DEFAULT_STOREFRONT_CACHE_FRESH_SECONDS = 60
const DEFAULT_STOREFRONT_CACHE_SWR_SECONDS = 3600

const STOREFRONT_SWR_MATCH = {
  block: 'block.storefront.*',
  brand: 'brand.storefront.*',
  location: 'location.storefront.*',
  blog: 'blog.storefront.*',
  'delivery-slot': 'delivery-slot.*'
}

function resolveFreshSeconds (params) {
  const value = Number(params.STOREFRONT_CACHE_FRESH_SECONDS) ||
    Number(params.BLOG_STOREFRONT_CACHE_FRESH_SECONDS)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_STOREFRONT_CACHE_FRESH_SECONDS
}

function resolveSwrSeconds (params) {
  const value = Number(params.STOREFRONT_CACHE_SWR_SECONDS) ||
    Number(params.BLOG_STOREFRONT_CACHE_SWR_SECONDS)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_STOREFRONT_CACHE_SWR_SECONDS
}

function stableHash (value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('base64url')
}

async function createStorefrontSwrCache (params, options = {}) {
  const freshSeconds = resolveFreshSeconds(params)
  const swrSeconds = resolveSwrSeconds(params)
  return createSwrStateCache(
    {
      ...params,
      STOREFRONT_CACHE_FRESH_SECONDS: freshSeconds,
      STOREFRONT_CACHE_SWR_SECONDS: swrSeconds
    },
    {
      freshSecondsParam: 'STOREFRONT_CACHE_FRESH_SECONDS',
      swrSecondsParam: 'STOREFRONT_CACHE_SWR_SECONDS',
      defaultFreshSeconds: freshSeconds,
      defaultSwrSeconds: swrSeconds,
      ...options
    }
  )
}

async function invalidateStorefrontSwrCache (params, domain) {
  const match = STOREFRONT_SWR_MATCH[domain]
  if (!match) return
  try {
    const cache = await createStorefrontSwrCache(params)
    await cache.invalidateAll(match)
  } catch {
    // Best-effort; admin and flush paths must still succeed.
  }
}

async function invalidateAllStorefrontSwrCaches (params) {
  await Promise.all(
    Object.keys(STOREFRONT_SWR_MATCH).map(domain => invalidateStorefrontSwrCache(params, domain))
  )
}

module.exports = {
  DEFAULT_STOREFRONT_CACHE_FRESH_SECONDS,
  DEFAULT_STOREFRONT_CACHE_SWR_SECONDS,
  STOREFRONT_SWR_MATCH,
  stableHash,
  createStorefrontSwrCache,
  invalidateStorefrontSwrCache,
  invalidateAllStorefrontSwrCaches
}
