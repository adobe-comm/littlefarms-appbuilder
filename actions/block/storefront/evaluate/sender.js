const { createRulesStore } = require('../../lib/rules-store')
const { createCatalogClient } = require('../../lib/catalog-client')
const { mapProductContext } = require('../../lib/product-context')
const { selectBlocks } = require('../../lib/evaluate')

async function send (request, params, logger) {
  if (request.cached) {
    return { body: request.cached, cacheable: false, cacheHit: true }
  }

  try {
    const store = createRulesStore(params)
    const catalog = createCatalogClient(params)
    const rules = await store.list({
      enabled: true,
      storeViewCode: { $in: [request.storeViewCode, '*'] }
    })
    const product = await catalog.getProduct(request.sku, request.storeViewCode)
    const context = mapProductContext(product)
    const body = {
      blocks: context ? selectBlocks(context, rules, request.storeViewCode) : []
    }
    return { body, cacheable: true, cacheHit: false }
  } catch (error) {
    logger.error(`Conditional block evaluation failed for SKU ${request.sku}: ${error.message}`)
    return { body: { blocks: [] }, cacheable: false, cacheHit: false }
  }
}

module.exports = { send }
