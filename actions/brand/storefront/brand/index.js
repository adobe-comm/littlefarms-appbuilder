const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { ALL_STORE_VIEWS } = require('../../lib/constants')
const { createBrandStore, storefrontBrand } = require('../../lib/brand-store')
const { createBrandCache } = require('../../lib/brand-cache')

function isWarmPing (params) {
  if (params.warm === true || params.warm === 'true') return true
  const payload = params.trigger_payload
  if (!payload) return false
  if (typeof payload === 'object') return payload.warm === true || payload.warm === 'true'
  try {
    const parsed = JSON.parse(payload)
    return parsed.warm === true || parsed.warm === 'true'
  } catch {
    return false
  }
}

function lookupFrom (params) {
  const id = String(params.id || '').trim()
  const name = String(params.name || '').trim()
  const urlAlias = String(params.urlAlias || '').trim()
  return { id, name, urlAlias, count: [id, name, urlAlias].filter(Boolean).length }
}

function widgetFrom (value) {
  const widget = String(value || '').trim().toUpperCase()
  if (!widget) return 'ALL'
  if (widget === 'LIST' || widget === 'SLIDER') return widget
  return ''
}

function optionalBoolean (value, label) {
  if (value == null || value === '') return undefined
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  const error = new Error(`${label} must be true or false.`)
  error.statusCode = 400
  throw error
}

function criteriaFrom (params) {
  return {
    name: String(params.name || '').trim(),
    isActive: optionalBoolean(params.isActive, 'isActive'),
    isNewBrand: optionalBoolean(params.isNewBrand, 'isNewBrand'),
    isTopBrand: optionalBoolean(params.isTopBrand, 'isTopBrand'),
    isFeatured: optionalBoolean(params.isFeatured, 'isFeatured'),
    showInBrandListWidget: optionalBoolean(params.showInBrandListWidget, 'showInBrandListWidget'),
    showInBrandSliderWidget: optionalBoolean(params.showInBrandSliderWidget, 'showInBrandSliderWidget')
  }
}

function criteriaCacheKey (criteria) {
  const parts = []
  if (criteria.name) parts.push(`name=${criteria.name.toLowerCase()}`)
  for (const key of ['isActive', 'isNewBrand', 'isTopBrand', 'isFeatured', 'showInBrandListWidget', 'showInBrandSliderWidget']) {
    if (criteria[key] != null) parts.push(`${key}=${criteria[key]}`)
  }
  return parts.join('&')
}

function storeViewFrom (params) {
  return String(params.storeViewCode || ALL_STORE_VIEWS).trim() || ALL_STORE_VIEWS
}

async function rememberBrand (cache, storeViewCode, brand) {
  const writes = [
    cache.putBrand(storeViewCode, 'id', brand.id, brand)
  ]
  if (brand.name) writes.push(cache.putBrand(storeViewCode, 'name', brand.name, brand))
  if (brand.urlAlias) writes.push(cache.putBrand(storeViewCode, 'alias', brand.urlAlias, brand))
  await Promise.all(writes)
}

async function main (params) {
  const logger = Core.Logger('brand-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    if (isWarmPing(params)) {
      return { statusCode: 200, body: { message: 'action is live' } }
    }

    const operation = String(params.operation || '').trim().toLowerCase()
    const storeViewCode = storeViewFrom(params)
    const cache = await createBrandCache(params)

    if (operation === 'get') {
      const lookup = lookupFrom(params)
      if (lookup.count !== 1) {
        return errorResponse(400, 'Provide exactly one of id, name, or urlAlias.', logger)
      }
      const kind = lookup.id ? 'id' : (lookup.name ? 'name' : 'alias')
      const value = lookup.id || lookup.name || lookup.urlAlias
      const cached = await cache.getBrand(storeViewCode, kind, value)
      if (cached) return { statusCode: 200, body: { brand: cached } }

      const store = createBrandStore(params)
      const settings = await store.getSettings()
      const resolved = await store.findResolved({
        attributeCode: settings.brandAttributeCode,
        storeViewCode,
        id: lookup.id,
        name: lookup.name,
        urlAlias: lookup.urlAlias
      })
      if (!resolved) return errorResponse(404, 'Brand not found.', logger)

      const brand = storefrontBrand(resolved)
      await rememberBrand(cache, storeViewCode, brand)
      if (value !== brand.id && value !== brand.name && value !== brand.urlAlias) {
        await cache.putBrand(storeViewCode, kind, value, brand)
      }
      return { statusCode: 200, body: { brand } }
    }

    if (operation === 'directory') {
      const cached = await cache.getDirectory(storeViewCode)
      if (cached) return { statusCode: 200, body: cached }

      const store = createBrandStore(params)
      const settings = await store.getSettings()
      const body = await store.listDirectory({
        attributeCode: settings.brandAttributeCode,
        storeViewCode
      })
      await cache.putDirectory(storeViewCode, body)
      logger.info(`Stored brand directory for ${storeViewCode}: ${body.items.length}`)
      return { statusCode: 200, body }
    }

    if (operation === 'list') {
      const widget = widgetFrom(params.widget)
      if (!widget) return errorResponse(400, 'widget must be LIST, SLIDER, or omitted.', logger)
      const criteria = criteriaFrom(params)
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 50))
      const criteriaKey = criteriaCacheKey(criteria)
      const cacheWidget = criteriaKey
        ? `${widget}.${pageSize}.detail.${Buffer.from(criteriaKey).toString('base64url')}`
        : `${widget}.${pageSize}.detail`
      const cached = await cache.getWidgetPage(storeViewCode, cacheWidget, page)
      if (cached) return { statusCode: 200, body: cached }

      const store = createBrandStore(params)
      const settings = await store.getSettings()
      const body = await store.pageStorefront({
        attributeCode: settings.brandAttributeCode,
        storeViewCode,
        widget: widget === 'ALL' ? undefined : widget,
        page,
        pageSize,
        criteria
      })
      await cache.putWidgetPage(storeViewCode, cacheWidget, page, body)
      return { statusCode: 200, body }
    }

    return errorResponse(400, 'operation must be get, list, or directory.', logger)
  } catch (error) {
    logger.error(error.message || 'Brand storefront read failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
