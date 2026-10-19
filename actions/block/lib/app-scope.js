/**
 * Global app scope: blocks are not partitioned by Commerce store view in App Builder storage.
 * Storefront evaluate still receives storeViewCode per request from the shopper context.
 */

const GLOBAL_SCOPE_STORE_VIEW = '*'

/** Default store view sent on ACCS GraphQL calls (API header only; does not scope saved blocks). */
const CATALOG_GRAPHQL_STORE_VIEW_DEFAULT = 'default'

function presetScopeFromParams (_params) {
  return {
    storeViewCode: GLOBAL_SCOPE_STORE_VIEW
  }
}

/**
 * Commerce SaaS GraphQL API environment segment (HTTP header only — not stored on DB documents).
 */
function resolveCommerceEnvironmentId (params) {
  let id = String(params.MAGENTO_ENVIRONMENT_ID || '').trim()
  if (!id && params.COMMERCE_CORE_GRAPHQL_URL) {
    try {
      id = new URL(params.COMMERCE_CORE_GRAPHQL_URL).pathname
        .split('/')
        .filter(segment => segment && segment !== 'graphql')[0] || ''
    } catch {
      id = ''
    }
  }
  return id
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
  resolveCommerceEnvironmentId,
  /** @deprecated use resolveCommerceEnvironmentId (Commerce API only) */
  resolveEnvironmentId: resolveCommerceEnvironmentId
}
