const { withCommerceCoreGraphqlUrl } = require('../../block/lib/enrich-commerce-params')
const { resolveCommerceEnvironmentId } = require('../../block/lib/app-scope')

/** Ensures Commerce GraphQL URL and Magento-Environment-Id header inputs are present for catalog calls. */
async function withBlogEnvironmentParams (params) {
  const enriched = await withCommerceCoreGraphqlUrl(params)
  const commerceEnvironmentId = resolveCommerceEnvironmentId(enriched)
  return {
    ...enriched,
    MAGENTO_ENVIRONMENT_ID: commerceEnvironmentId
  }
}

module.exports = {
  withBlogEnvironmentParams
}
