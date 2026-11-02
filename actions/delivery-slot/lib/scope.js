const { resolveCommerceEnvironmentId } = require('../../block/lib/app-scope')

function text (value) {
  return String(value ?? '').trim()
}

function scopeFromParams (params) {
  const environmentId = resolveCommerceEnvironmentId(params)
  const storeViewCode = text(params.storeViewCode || params.MAGENTO_STORE_VIEW_CODE || 'default') || 'default'
  return { environmentId, storeViewCode }
}

function documentId (scope) {
  return `${scope.environmentId}:${scope.storeViewCode}`
}

module.exports = {
  scopeFromParams,
  documentId
}
