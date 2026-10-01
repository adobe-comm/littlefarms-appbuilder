function transform (params) {
  return {
    sku: params.sku.trim(),
    storeViewCode: params.storeViewCode.trim()
  }
}

module.exports = { transform }
