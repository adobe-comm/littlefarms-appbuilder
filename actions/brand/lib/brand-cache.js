const stateLib = require('@adobe/aio-lib-state')

const { DEFAULT_BRAND_CACHE_TTL } = require('./constants')

function encodePart (value) {
  return Buffer.from(String(value)).toString('base64url')
}

function brandKey (storeViewCode, kind, value) {
  return `brand.${encodePart(storeViewCode)}.${kind}.${encodePart(value)}`
}

function widgetKey (storeViewCode, widget, page) {
  return `brand.${encodePart(storeViewCode)}.widget.${widget}.${page}`
}

function directoryKey (storeViewCode) {
  return `brand.${encodePart(storeViewCode)}.directory.active`
}

const SETTINGS_KEY = 'brand.settings'
const BRAND_CHOICE_KEY = 'catalog.brand-settings'
const BRAND_CHOICE_TTL = stateLib.MAX_TTL

function parseCached (result) {
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
}

async function createBrandCache (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })
  const ttl = Number(params.PRESET_RESULT_CACHE_TTL) || DEFAULT_BRAND_CACHE_TTL

  return {
    ttl,
    async getBrand (storeViewCode, kind, value) {
      return parseCached(await state.get(brandKey(storeViewCode, kind, value)))
    },
    putBrand: (storeViewCode, kind, value, body) =>
      state.put(brandKey(storeViewCode, kind, value), JSON.stringify(body), { ttl }),
    async getWidgetPage (storeViewCode, widget, page) {
      return parseCached(await state.get(widgetKey(storeViewCode, widget, page)))
    },
    putWidgetPage: (storeViewCode, widget, page, body) =>
      state.put(widgetKey(storeViewCode, widget, page), JSON.stringify(body), { ttl }),
    async getDirectory (storeViewCode) {
      return parseCached(await state.get(directoryKey(storeViewCode)))
    },
    putDirectory: (storeViewCode, body) =>
      state.put(directoryKey(storeViewCode), JSON.stringify(body), { ttl: BRAND_CHOICE_TTL }),
    async getSettings () {
      return parseCached(await state.get(SETTINGS_KEY))
    },
    putSettings: body => state.put(SETTINGS_KEY, JSON.stringify(body), { ttl }),
    async getBrandChoice () {
      return parseCached(await state.get(BRAND_CHOICE_KEY))
    },
    putBrandChoice: body => state.put(BRAND_CHOICE_KEY, JSON.stringify(body), { ttl: BRAND_CHOICE_TTL }),
    invalidateAll: () => state.deleteAll({ match: 'brand.*' })
  }
}

module.exports = {
  encodePart,
  brandKey,
  widgetKey,
  directoryKey,
  SETTINGS_KEY,
  BRAND_CHOICE_KEY,
  BRAND_CHOICE_TTL,
  createBrandCache
}
