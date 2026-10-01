/**
 * Global app scope: blocks are not partitioned by Commerce store view in App Builder storage.
 * Storefront evaluate still receives storeViewCode per request from the shopper context.
 */

const GLOBAL_SCOPE_STORE_VIEW = '*'

/** Default store view sent on ACCS GraphQL calls (API header only; does not scope saved blocks). */
const CATALOG_GRAPHQL_STORE_VIEW_DEFAULT = 'default'

function resolveEnvironmentId (params) {
  let environmentId = String(params.MAGENTO_ENVIRONMENT_ID || '').trim()
  if (!environmentId && params.COMMERCE_CORE_GRAPHQL_URL) {
    try {
      environmentId = new URL(params.COMMERCE_CORE_GRAPHQL_URL).pathname
        .split('/')
        .filter(segment => segment && segment !== 'graphql')[0] || ''
    } catch {
      environmentId = ''
    }
  }
  return environmentId || 'default'
}

function presetScopeFromParams (params) {
  return {
    storeViewCode: GLOBAL_SCOPE_STORE_VIEW,
    environmentId: resolveEnvironmentId(params)
  }
}

function catalogGraphqlStoreView (params) {
  const override = String(params.MAGENTO_STORE_VIEW_CODE || '').trim()
  return override || CATALOG_GRAPHQL_STORE_VIEW_DEFAULT
}

module.exports = {
  GLOBAL_SCOPE_STORE_VIEW,
  CATALOG_GRAPHQL_STORE_VIEW_DEFAULT,
  presetScopeFromParams,
  catalogGraphqlStoreView,
  resolveEnvironmentId
}
