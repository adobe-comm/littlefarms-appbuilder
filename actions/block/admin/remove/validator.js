function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }
  if (!String(params.id || '').trim()) {
    return { valid: false, statusCode: 400, error: 'Rule id is required.' }
  }
  return { valid: true }
}

module.exports = { validate }
