function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }
  return { valid: true }
}

module.exports = { validate }
