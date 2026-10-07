const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { DEFAULT_STORE_VIEW } = require('../../lib/constants')
const { createBrandStore } = require('../../lib/brand-store')

async function main (params) {
  const logger = Core.Logger('brand-list', { level: params.LOG_LEVEL || 'info' })

  try {
    const store = createBrandStore(params)
    const attributeCode = String(params.attributeCode || '').trim()
    const storeViewCode = String(params.storeViewCode || DEFAULT_STORE_VIEW).trim() || DEFAULT_STORE_VIEW
    const optionValue = String(params.optionValue || '').trim()
    if (optionValue) {
      const brand = await store.getAdminBrand({ attributeCode, optionValue, storeViewCode })
      if (!brand) return errorResponse(404, 'Brand not found.', logger)
      logger.info(`Opened brand ${attributeCode}:${optionValue}`)
      return { statusCode: 200, body: { attributeCode, storeViewCode, brand } }
    }

    const page = await store.pageAdmin({
      attributeCode,
      storeViewCode,
      page: params.page,
      pageSize: params.pageSize
    })
    logger.info(`Listed brands for ${attributeCode || 'no attribute'} page ${page.page}`)
    return {
      statusCode: 200,
      body: {
        attributeCode,
        storeViewCode,
        ...page
      }
    }
  } catch (error) {
    logger.error(error.message || 'Brand list failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
