const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { ALL_STORE_VIEWS } = require('../../lib/constants')
const { createBrandStore, storefrontBrand } = require('../../lib/brand-store')
const { createBrandCache } = require('../../lib/brand-cache')

function useDefaultFields (value) {
  if (Array.isArray(value)) return value.map(field => String(field))
  return []
}

async function main (params) {
  const logger = Core.Logger('brand-write', { level: params.LOG_LEVEL || 'info' })

  try {
    const attributeCode = String(params.attributeCode || '').trim()
    const optionValue = String(params.optionValue || '').trim()
    if (!attributeCode || !optionValue) {
      return errorResponse(400, 'attributeCode and optionValue are required.', logger)
    }

    const store = createBrandStore(params)
    const brand = await store.writeScope({
      attributeCode,
      optionValue,
      storeViewCode: params.storeViewCode || ALL_STORE_VIEWS,
      fields: params.fields && typeof params.fields === 'object' ? params.fields : {},
      useDefault: useDefaultFields(params.useDefault)
    })
    const cache = await createBrandCache(params)
    await cache.invalidateAll()
    logger.info(`Saved brand ${attributeCode}:${optionValue}`)
    return {
      statusCode: 200,
      body: {
        brand,
        storefront: storefrontBrand(brand)
      }
    }
  } catch (error) {
    logger.error(error.message || 'Brand write failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
