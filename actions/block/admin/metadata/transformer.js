function transform (params) {
  return {
    resource: params.resource,
    search: String(params.search || '').trim(),
    page: Number(params.page) || 1,
    entityId: String(params.entityId || '').trim(),
    typeId: String(params.typeId || '').trim(),
    attributeSetId: String(params.attributeSetId || '').trim(),
    sku: String(params.sku || '').trim(),
    name: String(params.name || '').trim(),
    aggregator: params.aggregator === 'any' ? 'any' : 'all',
    matchValue: params.matchValue !== false,
    productsToDisplay: params.productsToDisplay,
    conditions: Array.isArray(params.conditions) ? params.conditions : []
  }
}

module.exports = { transform }
