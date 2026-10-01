function transform (params) {
  return {
    id: String(params.id || '').trim() || null,
    storeViewCode: String(params.storeViewCode || '').trim() || null
  }
}

module.exports = { transform }
