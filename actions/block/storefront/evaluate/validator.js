const { validateStorefrontSecret } = require('../../lib/storefront-auth')

function validate (params) {
  const secretCheck = validateStorefrontSecret(params)
  if (!secretCheck.valid) {
    return { valid: false, statusCode: secretCheck.statusCode, error: secretCheck.error }
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
