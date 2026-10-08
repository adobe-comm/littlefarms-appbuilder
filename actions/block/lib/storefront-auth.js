function getProvidedStorefrontSecret (params) {
  const headers = params.__ow_headers || {}
  return (
    headers['x-conditional-block-secret'] ||
    headers['x-littlefarms-storefront-secret'] ||
    params.sharedSecret
  )
}

function validateStorefrontSecret (params) {
  const providedSecret = getProvidedStorefrontSecret(params)
  if (!params.EVALUATE_SHARED_SECRET || providedSecret !== params.EVALUATE_SHARED_SECRET) {
    return { valid: false, statusCode: 401, error: 'Unauthorized.' }
  }
  return { valid: true }
}

module.exports = {
  getProvidedStorefrontSecret,
  validateStorefrontSecret
}
