async function postProcess (result, request) {
  if (result.cacheable) {
    await request.cache.put(request.storeViewCode, request.sku, result.body)
  }
  return result.body
}

module.exports = { postProcess }
