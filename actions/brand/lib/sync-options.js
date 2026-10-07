const { createAttributeCatalog } = require('../../block/lib/attribute-catalog')

async function listDropdownAttributes (params) {
  const catalog = createAttributeCatalog(params)
  const attributes = await catalog.listAttributes()
  return attributes
    .filter(attribute => attribute.input === 'select')
    .map(attribute => ({
      code: attribute.code,
      label: attribute.label || attribute.code,
      optionsCount: (attribute.options || []).length
    }))
}

async function syncActiveAttribute (store, params) {
  const settings = await store.getSettings()
  const attributeCode = settings.brandAttributeCode
  if (!attributeCode) {
    return { attributeCode: '', inserted: 0, updated: 0, removed: 0 }
  }

  const catalog = createAttributeCatalog(params)
  const attribute = await catalog.attributeOptions(attributeCode)
  if (!attribute) {
    const error = new Error('The selected brand attribute is not a dropdown.')
    error.statusCode = 400
    throw error
  }

  const counts = await store.syncOptions(attributeCode, attribute.options || [])
  return { attributeCode, ...counts }
}

module.exports = {
  listDropdownAttributes,
  syncActiveAttribute
}
