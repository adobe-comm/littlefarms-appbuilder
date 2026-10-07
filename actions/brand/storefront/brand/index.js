const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { DEFAULT_STORE_VIEW } = require('../../lib/constants')
const { createBrandStore, storefrontBrand } = require('../../lib/brand-store')
const { createBrandCache } = require('../../lib/brand-cache')

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

function storeViewFrom (params) {
  return String(params.storeViewCode || DEFAULT_STORE_VIEW).trim() || DEFAULT_STORE_VIEW
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
      const page = Math.max(1, Number(params.page) || 1)
      const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 50))
      const cacheWidget = `${widget}.${pageSize}.detail`
      const cached = await cache.getWidgetPage(storeViewCode, cacheWidget, page)
      if (cached) return { statusCode: 200, body: cached }

      const store = createBrandStore(params)
      const settings = await store.getSettings()
      const body = await store.pageStorefront({
        attributeCode: settings.brandAttributeCode,
        storeViewCode,
        widget: widget === 'ALL' ? undefined : widget,
        page,
        pageSize
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
