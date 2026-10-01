const { createAttributeCatalog } = require('../../lib/attribute-catalog')

async function send (request, params) {
  const catalog = params.attributeCatalog || createAttributeCatalog(params)
  if (request.resource === 'attributes') return { attributes: await catalog.listAttributes() }
  if (request.resource === 'categories') return { categories: await catalog.listCategories() }
  if (request.resource === 'matches') return { products: await catalog.matchProducts(request) }
  if (request.resource === 'catalog') return catalog.browseProducts(request, request.page)
  return { products: await catalog.searchProducts(request.search) }
}

module.exports = { send }
