const path = require('path')
const { resolveCommerceEnvironmentId } = require('../../../actions/block/lib/app-scope')
const {
  resolveImsCredentials,
  applyImsToParams,
  resolveRuntimeCredentials
} = require('./aio-runtime-config')

function loadDotenv () {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })
  } catch {
    // optional when env is already exported
  }
}

/**
 * @param {{ withIms?: boolean, requireRuntime?: boolean }} [options]
 * withIms: attach clientId/clientSecret/orgId for @adobe/aio-lib-db and AuthClient
 * requireRuntime: fail if runtime namespace cannot be resolved (for --use-db-sdk)
 */
function loadRuntimeParams (options = {}) {
  loadDotenv()

  const params = {
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    DB_REGION: process.env.DB_REGION || process.env.AIO_DB_REGION || 'amer',
    STATE_REGION: process.env.STATE_REGION || process.env.DB_REGION || 'amer',
    MAGENTO_ENVIRONMENT_ID: process.env.MAGENTO_ENVIRONMENT_ID || '',
    COMMERCE_CORE_GRAPHQL_URL: process.env.COMMERCE_CORE_GRAPHQL_URL || ''
  }

  const commerceEnvironmentId = resolveCommerceEnvironmentId(params)
  if (commerceEnvironmentId) {
    params.MAGENTO_ENVIRONMENT_ID = commerceEnvironmentId
  }

  if (!options.withIms) return params

  const ims = resolveImsCredentials()
  const withIms = applyImsToParams(params, ims)
  try {
    const runtime = resolveRuntimeCredentials()
    return {
      ...withIms,
      __OW_NAMESPACE: runtime.namespace,
      AIO_RUNTIME_NAMESPACE: runtime.namespace,
      runtimeCredentialSource: runtime.source
    }
  } catch (error) {
    if (options.requireRuntime) {
      throw new Error(
        `Could not resolve runtime namespace (${error.message}). Run \`aio app use\` in this project.`
      )
    }
    return withIms
  }
}

module.exports = {
  loadRuntimeParams
}
