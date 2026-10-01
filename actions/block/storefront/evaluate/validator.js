function validate (params) {
  const headers = params.__ow_headers || {}
  const providedSecret = headers['x-conditional-block-secret'] || params.sharedSecret
  if (!params.EVALUATE_SHARED_SECRET || providedSecret !== params.EVALUATE_SHARED_SECRET) {
    return { valid: false, statusCode: 401, error: 'Unauthorized.' }
  }
  if (!String(params.sku || '').trim()) {
    return { valid: false, statusCode: 400, error: 'SKU is required.' }
  }
  if (!String(params.storeViewCode || '').trim()) {
    return { valid: false, statusCode: 400, error: 'Store view is required.' }
  }
  return { valid: true }
}

module.exports = { validate }
