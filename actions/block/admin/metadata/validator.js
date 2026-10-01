const RESOURCES = ['attributes', 'categories', 'products', 'catalog', 'matches']

function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }
  if (!RESOURCES.includes(params.resource)) {
    return { valid: false, statusCode: 400, error: 'Resource must be attributes, categories, products, catalog, or matches.' }
  }
  return { valid: true }
}

module.exports = { validate }
