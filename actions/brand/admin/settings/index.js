const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { withCommerceCoreGraphqlUrl } = require('../../../block/lib/enrich-commerce-params')
const { createBrandStore } = require('../../lib/brand-store')
const { createBrandCache } = require('../../lib/brand-cache')
const { listDropdownAttributes } = require('../../lib/sync-options')

function confirmed (value) {
  return value === true || value === 'true'
}

async function main (params) {
  const logger = Core.Logger('brand-settings', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withCommerceCoreGraphqlUrl(params)
    const operation = String(params.operation || 'get').trim().toLowerCase()
    const store = createBrandStore(params)

    if (operation === 'get') {
      const [settings, attributes] = await Promise.all([
        store.getSettings(),
        listDropdownAttributes(params)
      ])
      const body = {
        brandAttributeCode: settings.brandAttributeCode || '',
        updatedAt: settings.updatedAt || null,
        attributes
      }
      logger.info('Brand settings loaded. Attributes came from State when the catalog was current.')
      return { statusCode: 200, body }
    }

    if (operation === 'save') {
      const saved = await store.saveAttributeCode(params.brandAttributeCode, confirmed(params.confirmAttributeChange))
      if (saved.changed) {
        const cache = await createBrandCache(params)
        await cache.invalidateAll()
      }
      logger.info(`Brand attribute ${saved.changed ? 'changed' : 'unchanged'}: ${saved.brandAttributeCode}`)
      return { statusCode: 200, body: saved }
    }

    return errorResponse(400, 'operation must be get or save.', logger)
  } catch (error) {
    logger.error(error.message || 'Brand settings failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
